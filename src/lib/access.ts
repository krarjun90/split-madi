import type { Queryable } from "./db/types";
import { normalizeEmail, UserError, type Group, type Member } from "./repo";

const SESSION_ID_PATTERN = /^[0-9a-f]{64}$/;

export function isSessionId(value: string | undefined): value is string {
  return value !== undefined && SESSION_ID_PATTERN.test(value);
}

export async function createSession(db: Queryable): Promise<string> {
  const { rows } = await db.query<{ id: string }>("INSERT INTO sessions DEFAULT VALUES RETURNING id");
  return rows[0].id;
}

export async function sessionExists(db: Queryable, sessionId: string): Promise<boolean> {
  const { rows } = await db.query("SELECT 1 FROM sessions WHERE id = $1", [sessionId]);
  return rows.length > 0;
}

export async function deleteSession(db: Queryable, sessionId: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}

export async function grantMember(db: Queryable, sessionId: string, memberId: number) {
  await db.query(
    `INSERT INTO session_members (session_id, member_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [sessionId, memberId],
  );
}

export async function findSessionMember(
  db: Queryable,
  sessionId: string,
  groupId: string,
): Promise<Member | null> {
  const { rows } = await db.query<Member>(
    `SELECT m.id, m.name, m.email
       FROM session_members sm
       JOIN members m ON m.id = sm.member_id
      WHERE sm.session_id = $1 AND m.group_id = $2
      ORDER BY sm.added_at DESC
      LIMIT 1`,
    [sessionId, groupId],
  );
  return rows[0] ?? null;
}

export async function listSessionGroups(
  db: Queryable,
  sessionId: string,
): Promise<(Group & { memberCount: number })[]> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    base_currency: string;
    member_count: string;
  }>(
    `SELECT DISTINCT g.id, g.name, g.base_currency, g.created_at,
            (SELECT count(*) FROM members m2 WHERE m2.group_id = g.id) AS member_count
       FROM session_members sm
       JOIN members m ON m.id = sm.member_id
       JOIN groups g ON g.id = m.group_id
      WHERE sm.session_id = $1
      ORDER BY g.created_at DESC`,
    [sessionId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    baseCurrency: r.base_currency,
    memberCount: Number(r.member_count),
  }));
}

export type InviteTarget = { memberId: number; name: string; groupName: string };

export async function findInvite(
  db: Queryable,
  groupId: string,
  token: string,
): Promise<InviteTarget | null> {
  const { rows } = await db.query<{ member_id: number; name: string; group_name: string }>(
    `SELECT m.id AS member_id, m.name, g.name AS group_name
       FROM members m
       JOIN groups g ON g.id = m.group_id
      WHERE m.group_id = $1 AND m.invite_token = $2 AND m.email IS NOT NULL`,
    [groupId, token],
  );
  const row = rows[0];
  return row ? { memberId: row.member_id, name: row.name, groupName: row.group_name } : null;
}

export async function acceptInvite(
  db: Queryable,
  input: { groupId: string; token: string; email: string },
): Promise<Member> {
  const { rows } = await db.query<Member>(
    `UPDATE members SET claimed_at = COALESCE(claimed_at, now())
      WHERE group_id = $1 AND invite_token = $2 AND email = $3
      RETURNING id, name, email`,
    [input.groupId, input.token, normalizeEmail(input.email)],
  );
  const member = rows[0];
  if (!member) throw new UserError("That email does not match this invite");
  return member;
}

export type InviteLink = { memberId: number; token: string };

export async function listVisibleInviteLinks(
  db: Queryable,
  groupId: string,
  viewerMemberId: number,
): Promise<InviteLink[]> {
  const { rows } = await db.query<{ id: number; invite_token: string }>(
    `SELECT id, invite_token FROM members
      WHERE group_id = $1 AND email IS NOT NULL
        AND (id = $2 OR claimed_at IS NULL)
      ORDER BY id`,
    [groupId, viewerMemberId],
  );
  return rows.map((r) => ({ memberId: r.id, token: r.invite_token }));
}

export async function listJoinedMemberIds(db: Queryable, groupId: string): Promise<number[]> {
  const { rows } = await db.query<{ id: number }>(
    "SELECT id FROM members WHERE group_id = $1 AND claimed_at IS NOT NULL ORDER BY id",
    [groupId],
  );
  return rows.map((r) => r.id);
}

export async function resetInviteLink(db: Queryable, groupId: string, memberId: number) {
  const { rows } = await db.query(
    `UPDATE members SET invite_token = replace(gen_random_uuid()::text, '-', '')
      WHERE group_id = $1 AND id = $2 AND claimed_at IS NULL
      RETURNING id`,
    [groupId, memberId],
  );
  if (!rows[0]) throw new UserError("Only the link of someone who has not joined can be reset");
}
