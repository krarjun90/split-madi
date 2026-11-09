import { randomBytes } from "node:crypto";
import type { Db, Queryable } from "./db/types";
import { convertMinor, isSupportedCurrency } from "./money";
import { allocateByShares, type SplitType } from "./split";

export class UserError extends Error {}

export type Group = { id: string; name: string; baseCurrency: string };
export type Member = { id: number; name: string; email: string | null };
export type ExpenseSplit = { memberId: number; shares: number; amountMinor: number };
export type Expense = {
  id: number;
  description: string;
  amountMinor: number;
  currency: string;
  fxRate: number;
  baseAmountMinor: number;
  paidBy: number;
  splitType: SplitType;
  spentOn: string;
  createdBy: string;
  splits: ExpenseSplit[];
};
export type Payment = {
  id: number;
  fromMember: number;
  toMember: number;
  amountMinor: number;
  paidOn: string;
  createdBy: string;
};

export type ExpenseInput = {
  description: string;
  amountMinor: number;
  currency: string;
  fxRate: number;
  paidBy: number;
  splitType: SplitType;
  spentOn: string;
  parts: { memberId: number; shares: number }[];
};

export type PaymentInput = {
  fromMember: number;
  toMember: number;
  amountMinor: number;
  paidOn: string;
};

const MAX_AMOUNT_MINOR = 1_000_000_000_000;
const MAX_SHARES = 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireText(value: string, field: string, max = 120): string {
  const trimmed = value.trim();
  if (!trimmed) throw new UserError(`${field} is required`);
  if (trimmed.length > max) throw new UserError(`${field} must be at most ${max} characters`);
  return trimmed;
}

function requireDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new UserError("Date is not valid");
  }
  return value;
}

function requireAmount(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > MAX_AMOUNT_MINOR) {
    throw new UserError("Amount must be more than zero");
  }
  return amountMinor;
}

function newGroupId(): string {
  return randomBytes(9).toString("base64url");
}

export async function createGroup(
  db: Db,
  input: { name: string; baseCurrency: string; creatorName: string; creatorEmail: string },
): Promise<{ groupId: string; memberId: number }> {
  const name = requireText(input.name, "Group name");
  const creatorName = requireText(input.creatorName, "Your name", 60);
  const email = normalizeEmail(input.creatorEmail);
  if (!isValidEmail(email)) throw new UserError("Email is not valid");
  if (!isSupportedCurrency(input.baseCurrency)) throw new UserError("Currency is not supported");

  return db.transaction(async (tx) => {
    const groupId = newGroupId();
    await tx.query("INSERT INTO groups (id, name, base_currency) VALUES ($1, $2, $3)", [
      groupId,
      name,
      input.baseCurrency,
    ]);
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO members (group_id, name, email, claimed_at)
       VALUES ($1, $2, $3, now()) RETURNING id`,
      [groupId, creatorName, email],
    );
    return { groupId, memberId: rows[0].id };
  });
}

export async function getGroup(db: Queryable, groupId: string): Promise<Group | null> {
  const { rows } = await db.query<{ id: string; name: string; base_currency: string }>(
    "SELECT id, name, base_currency FROM groups WHERE id = $1",
    [groupId],
  );
  const row = rows[0];
  return row ? { id: row.id, name: row.name, baseCurrency: row.base_currency } : null;
}

export async function updateGroup(
  db: Db,
  groupId: string,
  input: { name: string; baseCurrency: string },
): Promise<void> {
  const name = requireText(input.name, "Group name");
  if (!isSupportedCurrency(input.baseCurrency)) throw new UserError("Currency is not supported");

  await db.transaction(async (tx) => {
    const group = await getGroup(tx, groupId);
    if (!group) throw new UserError("Group not found");
    if (group.baseCurrency !== input.baseCurrency) {
      const { rows } = await tx.query<{ used: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM expenses WHERE group_id = $1)
             OR EXISTS (SELECT 1 FROM payments WHERE group_id = $1) AS used`,
        [groupId],
      );
      if (rows[0].used) {
        throw new UserError("Base currency can only change before the first expense or payment");
      }
    }
    await tx.query("UPDATE groups SET name = $2, base_currency = $3 WHERE id = $1", [
      groupId,
      name,
      input.baseCurrency,
    ]);
  });
}

export async function listMembers(db: Queryable, groupId: string): Promise<Member[]> {
  const { rows } = await db.query<Member>(
    "SELECT id, name, email FROM members WHERE group_id = $1 ORDER BY id",
    [groupId],
  );
  return rows;
}

export async function findMemberByEmail(
  db: Queryable,
  groupId: string,
  email: string,
): Promise<Member | null> {
  const { rows } = await db.query<Member>(
    "SELECT id, name, email FROM members WHERE group_id = $1 AND email = $2",
    [groupId, normalizeEmail(email)],
  );
  return rows[0] ?? null;
}

export async function addMember(
  db: Queryable,
  groupId: string,
  input: { name: string; email?: string },
): Promise<Member> {
  const name = requireText(input.name, "Name", 60);
  const email = input.email ? normalizeEmail(input.email) : null;
  if (email && !isValidEmail(email)) throw new UserError("Email is not valid");
  if (email && (await findMemberByEmail(db, groupId, email))) {
    throw new UserError("Someone in this group already uses that email");
  }
  const { rows } = await db.query<Member>(
    "INSERT INTO members (group_id, name, email) VALUES ($1, $2, $3) RETURNING id, name, email",
    [groupId, name, email],
  );
  return rows[0];
}

export async function removeMember(db: Queryable, groupId: string, memberId: number) {
  const { rows } = await db.query<{ used: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM expenses WHERE paid_by = $1)
         OR EXISTS (SELECT 1 FROM expense_splits WHERE member_id = $1)
         OR EXISTS (SELECT 1 FROM payments WHERE from_member = $1 OR to_member = $1) AS used`,
    [memberId],
  );
  if (rows[0].used) {
    throw new UserError("This person is part of an expense or payment, so they cannot be removed");
  }
  await db.query("DELETE FROM members WHERE id = $1 AND group_id = $2", [memberId, groupId]);
}

async function requireMembers(tx: Queryable, groupId: string, memberIds: number[]) {
  const unique = [...new Set(memberIds)];
  const { rows } = await tx.query<{ count: string }>(
    "SELECT count(*) AS count FROM members WHERE group_id = $1 AND id = ANY($2::int[])",
    [groupId, unique],
  );
  if (Number(rows[0].count) !== unique.length) {
    throw new UserError("Everyone in the expense must be a member of this group");
  }
}

export async function saveExpense(
  db: Db,
  groupId: string,
  input: ExpenseInput,
  actorEmail: string,
  expenseId?: number,
): Promise<number> {
  const description = requireText(input.description, "Description");
  const amountMinor = requireAmount(input.amountMinor);
  const spentOn = requireDate(input.spentOn);
  if (!isSupportedCurrency(input.currency)) throw new UserError("Currency is not supported");
  if (input.splitType !== "equal" && input.splitType !== "shares") {
    throw new UserError("Split type is not valid");
  }

  const parts = input.parts
    .filter((p) => p.shares > 0)
    .map((p) => ({
      memberId: p.memberId,
      shares: input.splitType === "equal" ? 1 : p.shares,
    }));
  if (parts.some((p) => !Number.isInteger(p.shares) || p.shares > MAX_SHARES)) {
    throw new UserError(`Parts must be whole numbers from 0 to ${MAX_SHARES}`);
  }
  if (parts.length === 0) throw new UserError("Pick at least one person to split with");

  return db.transaction(async (tx) => {
    const group = await getGroup(tx, groupId);
    if (!group) throw new UserError("Group not found");

    const fxRate = input.currency === group.baseCurrency ? 1 : input.fxRate;
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      throw new UserError(`Exchange rate to ${group.baseCurrency} must be more than zero`);
    }
    const baseAmountMinor = requireAmount(
      convertMinor(amountMinor, input.currency, group.baseCurrency, fxRate),
    );
    await requireMembers(tx, groupId, [input.paidBy, ...parts.map((p) => p.memberId)]);
    const allocations = allocateByShares(baseAmountMinor, parts);

    const values = [
      groupId,
      description,
      amountMinor,
      input.currency,
      fxRate,
      baseAmountMinor,
      input.paidBy,
      input.splitType,
      spentOn,
    ];
    let id: number;
    if (expenseId) {
      const { rows } = await tx.query<{ id: number }>(
        `UPDATE expenses
            SET description = $2, amount_minor = $3, currency = $4, fx_rate = $5,
                base_amount_minor = $6, paid_by = $7, split_type = $8, spent_on = $9
          WHERE group_id = $1 AND id = $10
          RETURNING id`,
        [...values, expenseId],
      );
      if (!rows[0]) throw new UserError("Expense not found");
      id = rows[0].id;
      await tx.query("DELETE FROM expense_splits WHERE expense_id = $1", [id]);
    } else {
      const { rows } = await tx.query<{ id: number }>(
        `INSERT INTO expenses (group_id, description, amount_minor, currency, fx_rate,
                               base_amount_minor, paid_by, split_type, spent_on, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [...values, normalizeEmail(actorEmail)],
      );
      id = rows[0].id;
    }

    for (const a of allocations) {
      await tx.query(
        "INSERT INTO expense_splits (expense_id, member_id, shares, amount_minor) VALUES ($1, $2, $3, $4)",
        [id, a.memberId, a.shares, a.amountMinor],
      );
    }
    return id;
  });
}

export async function deleteExpense(db: Queryable, groupId: string, expenseId: number) {
  await db.query("DELETE FROM expenses WHERE group_id = $1 AND id = $2", [groupId, expenseId]);
}

type ExpenseRow = {
  id: number;
  description: string;
  amount_minor: string;
  currency: string;
  fx_rate: string;
  base_amount_minor: string;
  paid_by: number;
  split_type: SplitType;
  spent_on: string;
  created_by: string;
};

export async function listExpenses(
  db: Queryable,
  groupId: string,
  expenseId?: number,
): Promise<Expense[]> {
  const { rows } = await db.query<ExpenseRow>(
    `SELECT id, description, amount_minor, currency, fx_rate, base_amount_minor, paid_by,
            split_type, spent_on::text AS spent_on, created_by
       FROM expenses
      WHERE group_id = $1 AND ($2::int IS NULL OR id = $2)
      ORDER BY spent_on DESC, id DESC`,
    [groupId, expenseId ?? null],
  );
  if (rows.length === 0) return [];

  const { rows: splitRows } = await db.query<{
    expense_id: number;
    member_id: number;
    shares: number;
    amount_minor: string;
  }>(
    `SELECT expense_id, member_id, shares, amount_minor
       FROM expense_splits
      WHERE expense_id = ANY($1::int[])
      ORDER BY member_id`,
    [rows.map((r) => r.id)],
  );
  const splitsByExpense = new Map<number, ExpenseSplit[]>();
  for (const s of splitRows) {
    const list = splitsByExpense.get(s.expense_id) ?? [];
    list.push({ memberId: s.member_id, shares: s.shares, amountMinor: Number(s.amount_minor) });
    splitsByExpense.set(s.expense_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amountMinor: Number(r.amount_minor),
    currency: r.currency,
    fxRate: Number(r.fx_rate),
    baseAmountMinor: Number(r.base_amount_minor),
    paidBy: r.paid_by,
    splitType: r.split_type,
    spentOn: r.spent_on,
    createdBy: r.created_by,
    splits: splitsByExpense.get(r.id) ?? [],
  }));
}

export async function getExpense(db: Queryable, groupId: string, expenseId: number) {
  const [expense] = await listExpenses(db, groupId, expenseId);
  return expense ?? null;
}

export async function recordPayment(
  db: Db,
  groupId: string,
  input: PaymentInput,
  actorEmail: string,
): Promise<number> {
  const amountMinor = requireAmount(input.amountMinor);
  const paidOn = requireDate(input.paidOn);
  if (input.fromMember === input.toMember) {
    throw new UserError("A payment needs two different people");
  }
  return db.transaction(async (tx) => {
    await requireMembers(tx, groupId, [input.fromMember, input.toMember]);
    const { rows } = await tx.query<{ id: number }>(
      `INSERT INTO payments (group_id, from_member, to_member, amount_minor, paid_on, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [groupId, input.fromMember, input.toMember, amountMinor, paidOn, normalizeEmail(actorEmail)],
    );
    return rows[0].id;
  });
}

export async function deletePayment(db: Queryable, groupId: string, paymentId: number) {
  await db.query("DELETE FROM payments WHERE group_id = $1 AND id = $2", [groupId, paymentId]);
}

export async function listPayments(db: Queryable, groupId: string): Promise<Payment[]> {
  const { rows } = await db.query<{
    id: number;
    from_member: number;
    to_member: number;
    amount_minor: string;
    paid_on: string;
    created_by: string;
  }>(
    `SELECT id, from_member, to_member, amount_minor, paid_on::text AS paid_on, created_by
       FROM payments WHERE group_id = $1 ORDER BY paid_on DESC, id DESC`,
    [groupId],
  );
  return rows.map((r) => ({
    id: r.id,
    fromMember: r.from_member,
    toMember: r.to_member,
    amountMinor: Number(r.amount_minor),
    paidOn: r.paid_on,
    createdBy: r.created_by,
  }));
}
