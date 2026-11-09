import { execFileSync } from "node:child_process";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSession, findSessionMember, grantMember } from "@/lib/access";
import {
  claimAdminMembership,
  endAdminSession,
  hashPassword,
  isAdminSession,
  listAllGroups,
  logInAdmin,
  readAdminConfig,
  startAdminSession,
  verifyPassword,
  type AdminConfig,
} from "@/lib/admin";
import type { Db } from "@/lib/db/types";
import { createGroup } from "@/lib/repo";
import { createTestDb } from "./support/pglite-db";

const PASSWORD = "correct horse battery staple";
const IP = "203.0.113.7";

let config: AdminConfig;
let db: Db;

beforeAll(async () => {
  config = readAdminConfig({
    ADMIN_EMAIL: " Admin@Example.com ",
    ADMIN_PASSWORD_HASH: await hashPassword(PASSWORD),
  })!;
});

beforeEach(async () => {
  db = await createTestDb();
});

describe("admin configuration from the environment", () => {
  it("normalizes the admin email", () => {
    expect(config.email).toBe("admin@example.com");
  });

  it("is off when either variable is missing or the hash is not a scrypt hash", () => {
    expect(readAdminConfig({ ADMIN_EMAIL: "admin@example.com" })).toBeNull();
    expect(readAdminConfig({ ADMIN_PASSWORD_HASH: config.passwordHash })).toBeNull();
    expect(readAdminConfig({ ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD_HASH: PASSWORD })).toBeNull();
  });
});

describe("password hashes", () => {
  it("accepts the password and refuses any other, with a new salt on every hash", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await hashPassword(PASSWORD)).not.toBe(hash);
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
    expect(await verifyPassword(PASSWORD + " ", hash)).toBe(false);
  });

  it("makes hashes with `npm run hash-password` that the app accepts", async () => {
    const hash = execFileSync("node", ["scripts/hash-password.mjs"], { input: PASSWORD + "\n" }).toString();
    expect(await verifyPassword(PASSWORD, hash)).toBe(true);
  });

  it("refuses to hash a password shorter than 12 characters", () => {
    expect(() =>
      execFileSync("node", ["scripts/hash-password.mjs"], { input: "short", stdio: "pipe" }),
    ).toThrow();
  });
});

describe("signing in as admin", () => {
  it("accepts the admin email in any letter case with the right password", async () => {
    await expect(logInAdmin(db, config, { email: "ADMIN@example.com", password: PASSWORD, ip: IP })).resolves.toBeUndefined();
  });

  it("refuses a wrong password, another email, and any sign in when admin is not set up", async () => {
    const refused = "Email or password is not correct";
    await expect(logInAdmin(db, config, { email: "admin@example.com", password: "guess", ip: IP })).rejects.toThrow(refused);
    await expect(logInAdmin(db, config, { email: "ravi@example.com", password: PASSWORD, ip: IP })).rejects.toThrow(refused);
    await expect(logInAdmin(db, null, { email: "admin@example.com", password: PASSWORD, ip: IP })).rejects.toThrow(refused);
  });

  it("locks an address out after 5 failures, even for the right password, but not other addresses", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(logInAdmin(db, config, { email: "admin@example.com", password: "guess", ip: IP })).rejects.toThrow();
    }
    await expect(logInAdmin(db, config, { email: "admin@example.com", password: PASSWORD, ip: IP })).rejects.toThrow(
      "Too many failed attempts. Try again in 15 minutes.",
    );
    await expect(
      logInAdmin(db, config, { email: "admin@example.com", password: PASSWORD, ip: "198.51.100.1" }),
    ).resolves.toBeUndefined();
  });

  it("forgets earlier failures after a successful sign in", async () => {
    for (let i = 0; i < 4; i++) {
      await expect(logInAdmin(db, config, { email: "admin@example.com", password: "guess", ip: IP })).rejects.toThrow();
    }
    await logInAdmin(db, config, { email: "admin@example.com", password: PASSWORD, ip: IP });
    await expect(logInAdmin(db, config, { email: "admin@example.com", password: "guess", ip: IP })).rejects.toThrow(
      "Email or password is not correct",
    );
  });
});

describe("admin sessions", () => {
  it("is not admin for a normal member session (control)", async () => {
    expect(await isAdminSession(db, await createSession(db))).toBe(false);
  });

  it("gives a new session id on sign in and keeps the groups the browser already joined", async () => {
    const { groupId, memberId } = await createGroup(db, {
      name: "Goa trip",
      baseCurrency: "INR",
      creatorName: "Asha",
      creatorEmail: "asha@example.com",
    });
    const before = await createSession(db);
    await grantMember(db, before, memberId);

    const after = await startAdminSession(db, before);

    expect(after).not.toBe(before);
    expect(await isAdminSession(db, after)).toBe(true);
    expect(await isAdminSession(db, before)).toBe(false);
    expect((await findSessionMember(db, after, groupId))?.id).toBe(memberId);
  });

  it("stops being admin after leaving admin or after 30 days", async () => {
    const left = await startAdminSession(db, null);
    await endAdminSession(db, left);
    expect(await isAdminSession(db, left)).toBe(false);

    const old = await startAdminSession(db, null);
    await db.query("UPDATE sessions SET admin_until = now() - interval '1 second' WHERE id = $1", [old]);
    expect(await isAdminSession(db, old)).toBe(false);
  });
});

describe("the admin group list", () => {
  let sessionId: string;
  let joined: string;
  let adminNotSignedIn: string;
  let stranger: string;

  beforeEach(async () => {
    sessionId = await startAdminSession(db, null);
    const old = await createGroup(db, { name: "Old trip", baseCurrency: "INR", creatorName: "Me", creatorEmail: "admin@example.com" });
    adminNotSignedIn = old.groupId;
    await db.query("UPDATE groups SET created_at = now() - interval '2 days'");
    stranger = (await createGroup(db, { name: "Flat", baseCurrency: "INR", creatorName: "Zed", creatorEmail: "zed@example.com" })).groupId;
    await db.query("UPDATE groups SET created_at = now() - interval '1 day' WHERE id = $1", [stranger]);
    const created = await createGroup(db, { name: "Goa trip", baseCurrency: "USD", creatorName: "Me", creatorEmail: "admin@example.com" });
    joined = created.groupId;
    await grantMember(db, sessionId, created.memberId);
  });

  it("shows every group newest first, opens the ones this browser joined, and offers sign in where the admin email is a member", async () => {
    const groups = await listAllGroups(db, { sessionId, adminEmail: config.email });
    expect(groups.map((g) => [g.name, g.baseCurrency, g.memberCount, g.expenseCount, g.access])).toEqual([
      ["Goa trip", "USD", 1, 0, "open"],
      ["Flat", "INR", 1, 0, "none"],
      ["Old trip", "INR", 1, 0, "claim"],
    ]);
    expect(groups.map((g) => g.id)).toEqual([joined, stranger, adminNotSignedIn]);
  });

  it("signs the admin in to a group that lists the admin email", async () => {
    await claimAdminMembership(db, { groupId: adminNotSignedIn, adminEmail: config.email, sessionId });
    expect((await findSessionMember(db, sessionId, adminNotSignedIn))?.name).toBe("Me");
  });

  it("does not add the admin to a group the admin is not part of", async () => {
    await expect(
      claimAdminMembership(db, { groupId: stranger, adminEmail: config.email, sessionId }),
    ).rejects.toThrow("You are not a member of this group");
    expect(await findSessionMember(db, sessionId, stranger)).toBeNull();
  });
});
