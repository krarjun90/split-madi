import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import type { Db, Queryable } from "@/lib/db/types";

function wrap(pg: PGlite): Db {
  const asQueryable = (q: Pick<PGlite, "query" | "exec">): Queryable => ({
    async query(sql, params) {
      if (params?.length) return q.query(sql, params) as never;
      return { rows: ((await q.exec(sql)).at(-1)?.rows ?? []) as never };
    },
  });
  return { ...asQueryable(pg), transaction: (fn) => pg.transaction((tx) => fn(asQueryable(tx))) };
}

describe("upgrading a database created before invite links existed", () => {
  it("gives every existing member its own invite token and leaves them not joined", async () => {
    const pg = new PGlite();
    await pg.exec(`
      CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, base_currency TEXT NOT NULL,
                           created_at TIMESTAMPTZ NOT NULL DEFAULT now());
      CREATE TABLE members (id SERIAL PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id),
                            name TEXT NOT NULL, email TEXT,
                            joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (group_id, email));
      INSERT INTO groups (id, name, base_currency) VALUES ('g1', 'Old trip', 'INR');
      INSERT INTO members (group_id, name, email) VALUES
        ('g1', 'Asha', 'asha@example.com'), ('g1', 'Ravi', 'ravi@example.com');
    `);

    const db = wrap(pg);
    await migrate(db);
    await migrate(db);

    const { rows } = await pg.query<{ invite_token: string; claimed_at: Date | null }>(
      "SELECT invite_token, claimed_at FROM members ORDER BY id",
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => /^[0-9a-f]{32}$/.test(r.invite_token))).toBe(true);
    expect(rows[0].invite_token).not.toBe(rows[1].invite_token);
    expect(rows.map((r) => r.claimed_at)).toEqual([null, null]);
  });
});
