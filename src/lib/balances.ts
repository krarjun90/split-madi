export type LedgerExpense = {
  paidBy: number;
  baseAmountMinor: number;
  splits: { memberId: number; amountMinor: number }[];
};

export type LedgerPayment = { fromMember: number; toMember: number; amountMinor: number };

export type Transfer = { from: number; to: number; amountMinor: number };

export function netBalances(
  memberIds: number[],
  expenses: LedgerExpense[],
  payments: LedgerPayment[],
): Map<number, number> {
  const net = new Map(memberIds.map((id) => [id, 0]));
  const add = (id: number, delta: number) => net.set(id, (net.get(id) ?? 0) + delta);

  for (const e of expenses) {
    add(e.paidBy, e.baseAmountMinor);
    for (const s of e.splits) add(s.memberId, -s.amountMinor);
  }
  for (const p of payments) {
    add(p.fromMember, p.amountMinor);
    add(p.toMember, -p.amountMinor);
  }
  return net;
}

export function simplifyDebts(net: Map<number, number>): Transfer[] {
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, left: v }));
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, left: -v }));
  const byLargest = (a: { id: number; left: number }, b: { id: number; left: number }) =>
    b.left - a.left || a.id - b.id;

  const transfers: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byLargest);
    debtors.sort(byLargest);
    const creditor = creditors[0];
    const debtor = debtors[0];
    const amountMinor = Math.min(creditor.left, debtor.left);
    transfers.push({ from: debtor.id, to: creditor.id, amountMinor });
    creditor.left -= amountMinor;
    debtor.left -= amountMinor;
    if (creditor.left === 0) creditors.shift();
    if (debtor.left === 0) debtors.shift();
  }
  return transfers;
}
