import type { Db } from "./types";

const MIGRATION_LOCK_ID = 731_105;

export async function migrate(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)", [MIGRATION_LOCK_ID]);
    await tx.query(SCHEMA_SQL);
  });
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, email)
);
CREATE INDEX IF NOT EXISTS members_email_idx ON members (email);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  fx_rate NUMERIC(20, 10) NOT NULL DEFAULT 1,
  base_amount_minor BIGINT NOT NULL CHECK (base_amount_minor > 0),
  paid_by INTEGER NOT NULL REFERENCES members(id),
  split_type TEXT NOT NULL CHECK (split_type IN ('equal', 'shares')),
  spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_group_idx ON expenses (group_id, spent_on DESC, id DESC);

CREATE TABLE IF NOT EXISTS expense_splits (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id),
  shares INTEGER NOT NULL CHECK (shares > 0),
  amount_minor BIGINT NOT NULL,
  PRIMARY KEY (expense_id, member_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member INTEGER NOT NULL REFERENCES members(id),
  to_member INTEGER NOT NULL REFERENCES members(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_member <> to_member)
);
CREATE INDEX IF NOT EXISTS payments_group_idx ON payments (group_id);

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS invite_token TEXT NOT NULL
  DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE members ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS members_invite_token_idx ON members (invite_token);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY
    DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_members (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, member_id)
);
CREATE INDEX IF NOT EXISTS session_members_member_idx ON session_members (member_id);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS admin_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS admin_login_failures (
  id SERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_login_failures_ip_idx ON admin_login_failures (ip, failed_at);
`;
