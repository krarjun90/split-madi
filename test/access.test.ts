import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptInvite,
  createSession,
  deleteSession,
  findInvite,
  findSessionMember,
  grantMember,
  isSessionId,
  listJoinedMemberIds,
  listSessionGroups,
  listVisibleInviteLinks,
  resetInviteLink,
  sessionExists,
} from "@/lib/access";
import type { Db } from "@/lib/db/types";
import { addMember, createGroup, removeMember } from "@/lib/repo";
import { createTestDb } from "./support/pglite-db";

let db: Db;
let groupId: string;
let asha: number;
let ravi: number;
let dad: number;

async function join(sessionId: string, token: string, email: string) {
  const member = await acceptInvite(db, { groupId, token, email });
  await grantMember(db, sessionId, member.id);
  return member;
}

async function tokenOf(memberId: number): Promise<string> {
  const { rows } = await db.query<{ invite_token: string }>(
    "SELECT invite_token FROM members WHERE id = $1",
    [memberId],
  );
  return rows[0].invite_token;
}

beforeEach(async () => {
  db = await createTestDb();
  const created = await createGroup(db, {
    name: "Goa trip",
    baseCurrency: "INR",
    creatorName: "Asha",
    creatorEmail: "asha@example.com",
  });
  groupId = created.groupId;
  asha = created.memberId;
  ravi = (await addMember(db, groupId, { name: "Ravi", email: "ravi@example.com" })).id;
  dad = (await addMember(db, groupId, { name: "Dad" })).id;
});

describe("invite tokens", () => {
  it("gives every member a different 32-character hex token", async () => {
    const tokens = [await tokenOf(asha), await tokenOf(ravi), await tokenOf(dad)];
    expect(tokens.every((t) => /^[0-9a-f]{32}$/.test(t))).toBe(true);
    expect(new Set(tokens).size).toBe(3);
  });

  it("finds the invite only through the group it belongs to", async () => {
    const token = await tokenOf(ravi);
    const other = await createGroup(db, {
      name: "Flat",
      baseCurrency: "INR",
      creatorName: "Zed",
      creatorEmail: "zed@example.com",
    });
    expect(await findInvite(db, groupId, token)).toEqual({
      memberId: ravi,
      name: "Ravi",
      groupName: "Goa trip",
    });
    expect(await findInvite(db, other.groupId, token)).toBeNull();
  });

  it("has no usable invite for a member without an email", async () => {
    expect(await findInvite(db, groupId, await tokenOf(dad))).toBeNull();
  });
});

describe("accepting an invite", () => {
  it("lets the invited email in, in any letter case, and marks the member as joined", async () => {
    const sessionId = await createSession(db);
    const member = await join(sessionId, await tokenOf(ravi), "  RAVI@Example.com ");

    expect(member.id).toBe(ravi);
    expect((await findSessionMember(db, sessionId, groupId))?.id).toBe(ravi);
    expect(await listJoinedMemberIds(db, groupId)).toEqual([asha, ravi]);
  });

  it("refuses another member's email on Ravi's link, so knowing a member's email is not enough", async () => {
    await expect(
      acceptInvite(db, { groupId, token: await tokenOf(ravi), email: "asha@example.com" }),
    ).rejects.toThrow("That email does not match this invite");
    expect(await listJoinedMemberIds(db, groupId)).toEqual([asha]);
  });

  it("refuses the right email with a wrong token", async () => {
    await expect(
      acceptInvite(db, { groupId, token: "0".repeat(32), email: "ravi@example.com" }),
    ).rejects.toThrow("That email does not match this invite");
  });

  it("works again on a second device for a member who already joined", async () => {
    const token = await tokenOf(ravi);
    const phone = await createSession(db);
    const laptop = await createSession(db);
    await join(phone, token, "ravi@example.com");
    await join(laptop, token, "ravi@example.com");
    expect((await findSessionMember(db, laptop, groupId))?.id).toBe(ravi);
  });
});

describe("sessions", () => {
  it("accepts only 64-character hex ids as session cookies", async () => {
    expect(isSessionId(await createSession(db))).toBe(true);
    expect(isSessionId("asha@example.com")).toBe(false);
    expect(isSessionId(undefined)).toBe(false);
  });

  it("gives a session access only to groups where it was granted a member", async () => {
    const sessionId = await createSession(db);
    const other = await createGroup(db, {
      name: "Flat",
      baseCurrency: "USD",
      creatorName: "Asha",
      creatorEmail: "asha@example.com",
    });
    await grantMember(db, sessionId, asha);

    expect((await listSessionGroups(db, sessionId)).map((g) => [g.id, g.memberCount])).toEqual([
      [groupId, 3],
    ]);
    expect(await findSessionMember(db, sessionId, other.groupId)).toBeNull();
  });

  it("loses access when the member is removed from the group", async () => {
    const sessionId = await createSession(db);
    await grantMember(db, sessionId, dad);
    await removeMember(db, groupId, dad);
    expect(await findSessionMember(db, sessionId, groupId)).toBeNull();
  });

  it("forgets all access after sign out", async () => {
    const sessionId = await createSession(db);
    await grantMember(db, sessionId, asha);
    await deleteSession(db, sessionId);
    expect(await sessionExists(db, sessionId)).toBe(false);
    expect(await findSessionMember(db, sessionId, groupId)).toBeNull();
  });
});

describe("who can see which invite links", () => {
  it("shows a viewer their own link and links of invited people who have not joined", async () => {
    const links = await listVisibleInviteLinks(db, groupId, asha);
    expect(links.map((l) => l.memberId)).toEqual([asha, ravi]);
  });

  it("hides Ravi's link from Asha after Ravi joins, but Ravi still sees it", async () => {
    const token = await tokenOf(ravi);
    await join(await createSession(db), token, "ravi@example.com");

    expect((await listVisibleInviteLinks(db, groupId, asha)).map((l) => l.memberId)).toEqual([asha]);
    expect((await listVisibleInviteLinks(db, groupId, ravi)).map((l) => l.memberId)).toEqual([ravi]);
  });
});

describe("resetting an invite link", () => {
  it("replaces the token of someone who has not joined, so the old link stops working", async () => {
    const old = await tokenOf(ravi);
    await resetInviteLink(db, groupId, ravi);
    expect(await tokenOf(ravi)).not.toBe(old);
    expect(await findInvite(db, groupId, old)).toBeNull();
  });

  it("refuses to reset the link of someone who already joined", async () => {
    await expect(resetInviteLink(db, groupId, asha)).rejects.toThrow("has not joined");
  });
});
