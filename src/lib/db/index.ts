import "server-only";
import { Pool } from "pg";
import { migrate } from "./schema";
import type { Db } from "./types";

function connectionString(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "No database configured. Set DATABASE_URL (Vercel sets it when you connect a Neon database).",
    );
  }
  return url;
}

function createDb(): Db {
  const url = connectionString();
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
  });

  return {
    query: (sql, params) => pool.query(sql, params) as never,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({ query: (sql, params) => client.query(sql, params) as never });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

const globalForDb = globalThis as unknown as { splitDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.splitDb ??= (async () => {
    const db = createDb();
    await migrate(db);
    return db;
  })().catch((error) => {
    globalForDb.splitDb = undefined;
    throw error;
  });
  return globalForDb.splitDb;
}
