import { describe, expect, it } from "vitest";
import { netBalances, simplifyDebts } from "@/lib/balances";

const A = 1;
const B = 2;
const C = 3;
const D = 4;

describe("net balance per person", () => {
  it("credits the payer with the full amount and debits each person their split", () => {
    const net = netBalances(
      [A, B, C],
      [
        {
          paidBy: A,
          baseAmountMinor: 900,
          splits: [
            { memberId: A, amountMinor: 300 },
            { memberId: B, amountMinor: 300 },
            { memberId: C, amountMinor: 300 },
          ],
        },
      ],
      [],
    );
    expect(Object.fromEntries(net)).toEqual({ [A]: 600, [B]: -300, [C]: -300 });
  });

  it("moves a debtor toward zero when they record a payment to the creditor", () => {
    const net = netBalances(
      [A, B],
      [{ paidBy: A, baseAmountMinor: 1000, splits: [{ memberId: B, amountMinor: 1000 }] }],
      [{ fromMember: B, toMember: A, amountMinor: 400 }],
    );
    expect(Object.fromEntries(net)).toEqual({ [A]: 600, [B]: -600 });
  });

  it("shows zero for a member with no expenses", () => {
    expect(Object.fromEntries(netBalances([A, B], [], []))).toEqual({ [A]: 0, [B]: 0 });
  });
});

describe("simplifying debts", () => {
  it("collapses a chain A owes B owes C into one payment from A to C", () => {
    const transfers = simplifyDebts(
      new Map([
        [A, -500],
        [B, 0],
        [C, 500],
      ]),
    );
    expect(transfers).toEqual([{ from: A, to: C, amountMinor: 500 }]);
  });

  it("settles four people with at most three payments and clears every balance", () => {
    const net = new Map([
      [A, 1000],
      [B, -700],
      [C, 200],
      [D, -500],
    ]);
    const transfers = simplifyDebts(net);

    expect(transfers).toEqual([
      { from: B, to: A, amountMinor: 700 },
      { from: D, to: A, amountMinor: 300 },
      { from: D, to: C, amountMinor: 200 },
    ]);
    const after = new Map(net);
    for (const t of transfers) {
      after.set(t.from, after.get(t.from)! + t.amountMinor);
      after.set(t.to, after.get(t.to)! - t.amountMinor);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });

  it("returns no payments when everyone is already settled (control case)", () => {
    expect(simplifyDebts(new Map([[A, 0], [B, 0]]))).toEqual([]);
  });
});
