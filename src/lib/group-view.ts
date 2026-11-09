import "server-only";
import { netBalances, simplifyDebts } from "./balances";
import { getDb } from "./db";
import { listExpenses, listMembers, listPayments, type Group } from "./repo";

export async function loadGroupLedger(group: Group) {
  const db = await getDb();
  const [members, expenses, payments] = await Promise.all([
    listMembers(db, group.id),
    listExpenses(db, group.id),
    listPayments(db, group.id),
  ]);
  const net = netBalances(
    members.map((m) => m.id),
    expenses,
    payments,
  );
  return {
    members,
    expenses,
    payments,
    net,
    transfers: simplifyDebts(net),
    totalSpentMinor: expenses.reduce((sum, e) => sum + e.baseAmountMinor, 0),
  };
}

export type GroupLedger = Awaited<ReturnType<typeof loadGroupLedger>>;
