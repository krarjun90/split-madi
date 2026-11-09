import { PGlite } from "@electric-sql/pglite";
import { migrate } from "@/lib/db/schema";
import type { Db, Queryable } from "@/lib/db/types";

type PGliteLike = Pick<PGlite, "query" | "exec">;

function asQueryable(pg: PGliteLike): Queryable {
  return {
    async query(sql, params) {
      if (params?.length) return pg.query(sql, params) as never;
      const results = await pg.exec(sql);
      return { rows: (results.at(-1)?.rows ?? []) as never };
    },
  };
}

export async function createTestDb(): Promise<Db> {
  const pg = new PGlite();
  const db: Db = {
    ...asQueryable(pg),
    transaction: (fn) => pg.transaction((tx) => fn(asQueryable(tx))),
  };
  await migrate(db);
  return db;
}
