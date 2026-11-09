import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Queryable } from "./db/types";
import { normalizeEmail, UserError } from "./repo";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY_LENGTH = 64;
const HASH_PATTERN = /^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/;
const DUMMY_HASH = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

export const MAX_FAILURES = 5;
export const LOCKOUT_MINUTES = 15;
export const ADMIN_SESSION_DAYS = 30;

export type AdminConfig = { email: string; passwordHash: string };

export function readAdminConfig(env: Record<string, string | undefined>): AdminConfig | null {
  const email = env.ADMIN_EMAIL?.trim();
  const passwordHash = env.ADMIN_PASSWORD_HASH?.trim();
  if (!email || !passwordHash || !HASH_PATTERN.test(passwordHash)) return null;
  return { email: normalizeEmail(email), passwordHash };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = HASH_PATTERN.exec(stored);
  if (!match) return false;
  const expected = Buffer.from(match[2], "hex");
  const actual = await scrypt(password, Buffer.from(match[1], "hex"), KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

export async function checkAdminCredentials(
  config: AdminConfig | null,
  input: { email: string; password: string },
): Promise<boolean> {
  const emailMatches = config !== null && normalizeEmail(input.email) === config.email;
  const passwordMatches = await verifyPassword(input.password, config?.passwordHash ?? DUMMY_HASH);
  return emailMatches && passwordMatches;
}

export async function isLockedOut(db: Queryable, ip: string): Promise<boolean> {
  const { rows } = await db.query<{ failures: string }>(
    `SELECT count(*) AS failures FROM admin_login_failures
      WHERE ip = $1 AND failed_at > now() - make_interval(mins => $2)`,
    [ip, LOCKOUT_MINUTES],
  );
  return Number(rows[0].failures) >= MAX_FAILURES;
}

export async function recordFailure(db: Queryable, ip: string): Promise<void> {
  await db.query("INSERT INTO admin_login_failures (ip) VALUES ($1)", [ip]);
  await db.query(
    "DELETE FROM admin_login_failures WHERE failed_at < now() - make_interval(mins => $1)",
    [LOCKOUT_MINUTES],
  );
}

export async function clearFailures(db: Queryable, ip: string): Promise<void> {
  await db.query("DELETE FROM admin_login_failures WHERE ip = $1", [ip]);
}

export async function logInAdmin(
  db: Queryable,
  config: AdminConfig | null,
  input: { email: string; password: string; ip: string },
): Promise<void> {
  if (await isLockedOut(db, input.ip)) {
    throw new UserError(`Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`);
  }
  if (!(await checkAdminCredentials(config, input))) {
    await recordFailure(db, input.ip);
    throw new UserError("Email or password is not correct");
  }
  await clearFailures(db, input.ip);
}

export async function startAdminSession(db: Queryable, previousSessionId: string | null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO sessions (admin_until) VALUES (now() + make_interval(days => $1)) RETURNING id`,
    [ADMIN_SESSION_DAYS],
  );
  const sessionId = rows[0].id;
  if (previousSessionId) {
    await db.query(
      `INSERT INTO session_members (session_id, member_id, added_at)
       SELECT $1, member_id, added_at FROM session_members WHERE session_id = $2`,
      [sessionId, previousSessionId],
    );
    await db.query("DELETE FROM sessions WHERE id = $1", [previousSessionId]);
  }
  return sessionId;
}

export async function isAdminSession(db: Queryable, sessionId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT 1 FROM sessions WHERE id = $1 AND admin_until > now()",
    [sessionId],
  );
  return rows.length > 0;
}

export async function endAdminSession(db: Queryable, sessionId: string): Promise<void> {
  await db.query("UPDATE sessions SET admin_until = NULL WHERE id = $1", [sessionId]);
}

export type GroupAccess = "open" | "claim" | "none";

export type GroupSummary = {
  id: string;
  name: string;
  baseCurrency: string;
  memberCount: number;
  expenseCount: number;
  access: GroupAccess;
};

export async function listAllGroups(
  db: Queryable,
  viewer: { sessionId: string; adminEmail: string },
): Promise<GroupSummary[]> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    base_currency: string;
    member_count: string;
    expense_count: string;
    signed_in: boolean;
    admin_is_member: boolean;
  }>(
    `SELECT g.id, g.name, g.base_currency,
            (SELECT count(*) FROM members m WHERE m.group_id = g.id) AS member_count,
            (SELECT count(*) FROM expenses e WHERE e.group_id = g.id) AS expense_count,
            EXISTS (SELECT 1 FROM session_members sm JOIN members m ON m.id = sm.member_id
                     WHERE sm.session_id = $1 AND m.group_id = g.id) AS signed_in,
            EXISTS (SELECT 1 FROM members m WHERE m.group_id = g.id AND m.email = $2) AS admin_is_member
       FROM groups g
      ORDER BY g.created_at DESC
      LIMIT 200`,
    [viewer.sessionId, normalizeEmail(viewer.adminEmail)],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    baseCurrency: r.base_currency,
    memberCount: Number(r.member_count),
    expenseCount: Number(r.expense_count),
    access: r.signed_in ? "open" : r.admin_is_member ? "claim" : "none",
  }));
}

export async function claimAdminMembership(
  db: Queryable,
  input: { groupId: string; adminEmail: string; sessionId: string },
): Promise<void> {
  const { rows } = await db.query<{ id: number }>(
    `UPDATE members SET claimed_at = COALESCE(claimed_at, now())
      WHERE group_id = $1 AND email = $2
      RETURNING id`,
    [input.groupId, normalizeEmail(input.adminEmail)],
  );
  if (!rows[0]) throw new UserError("You are not a member of this group");
  await db.query(
    `INSERT INTO session_members (session_id, member_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [input.sessionId, rows[0].id],
  );
}
