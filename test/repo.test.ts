import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/types";
import {
  addMember,
  createGroup,
  deleteExpense,
  getExpense,
  getGroup,
  listExpenses,
  listMembers,
  listPayments,
  recordPayment,
  removeMember,
  saveExpense,
  updateGroup,
  type ExpenseInput,
} from "@/lib/repo";
import { createTestDb } from "./support/pglite-db";

let db: Db;
let groupId: string;
let asha: number;
let ravi: number;
let meera: number;

beforeEach(async () => {
  db = await createTestDb();
  const created = await createGroup(db, {
    name: "Goa trip",
    baseCurrency: "INR",
    creatorName: "Asha",
    creatorEmail: " Asha@Example.com ",
  });
  groupId = created.groupId;
  asha = created.memberId;
  ravi = (await addMember(db, groupId, { name: "Ravi", email: "ravi@example.com" })).id;
  meera = (await addMember(db, groupId, { name: "Meera", email: "meera@example.com" })).id;
});

function dinner(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    description: "Dinner",
    amountMinor: 60000,
    currency: "INR",
    fxRate: 1,
    paidBy: asha,
    splitType: "equal",
    spentOn: "2026-11-01",
    parts: [
      { memberId: asha, shares: 1 },
      { memberId: ravi, shares: 1 },
      { memberId: meera, shares: 1 },
    ],
    ...overrides,
  };
}

const splitAmounts = (expense: { splits: { memberId: number; amountMinor: number }[] }) =>
  Object.fromEntries(expense.splits.map((s) => [s.memberId, s.amountMinor]));

describe("creating a group", () => {
  it("stores the base currency and makes the creator the first member with a lowercase email", async () => {
    expect(await getGroup(db, groupId)).toEqual({ id: groupId, name: "Goa trip", baseCurrency: "INR" });
    expect((await listMembers(db, groupId))[0]).toEqual({
      id: asha,
      name: "Asha",
      email: "asha@example.com",
    });
  });

  it("gives each group a random 12-character link id", async () => {
    const other = await createGroup(db, {
      name: "Flat",
      baseCurrency: "INR",
      creatorName: "Asha",
      creatorEmail: "asha@example.com",
    });
    expect(groupId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(other.groupId).not.toBe(groupId);
  });

  it("rejects an unsupported base currency", async () => {
    await expect(
      createGroup(db, { name: "X", baseCurrency: "XYZ", creatorName: "A", creatorEmail: "a@b.co" }),
    ).rejects.toThrow("Currency is not supported");
  });
});

describe("adding and removing members", () => {
  it("refuses a second member with the same email", async () => {
    await expect(addMember(db, groupId, { name: "R2", email: "Ravi@example.com" })).rejects.toThrow(
      "already uses that email",
    );
  });

  it("removes a member who is in no expense", async () => {
    const extra = await addMember(db, groupId, { name: "Extra" });
    await removeMember(db, groupId, extra.id);
    expect((await listMembers(db, groupId)).map((m) => m.id)).toEqual([asha, ravi, meera]);
  });

  it("keeps a member who is part of an expense", async () => {
    await saveExpense(db, groupId, dinner(), "asha@example.com");
    await expect(removeMember(db, groupId, meera)).rejects.toThrow("cannot be removed");
  });
});

describe("saving an expense", () => {
  it("splits ₹600 equally into ₹200 each", async () => {
    const id = await saveExpense(db, groupId, dinner(), "asha@example.com");
    const expense = await getExpense(db, groupId, id);
    expect(expense).toMatchObject({
      description: "Dinner",
      amountMinor: 60000,
      baseAmountMinor: 60000,
      splitType: "equal",
      spentOn: "2026-11-01",
      createdBy: "asha@example.com",
    });
    expect(splitAmounts(expense!)).toEqual({ [asha]: 20000, [ravi]: 20000, [meera]: 20000 });
  });

  it("ignores typed parts on an equal split and gives everyone 1 part", async () => {
    const id = await saveExpense(
      db,
      groupId,
      dinner({ parts: [{ memberId: asha, shares: 5 }, { memberId: ravi, shares: 1 }] }),
      "asha@example.com",
    );
    expect(splitAmounts((await getExpense(db, groupId, id))!)).toEqual({ [asha]: 30000, [ravi]: 30000 });
  });

  it("splits ₹600 by 3/2/1 parts into ₹300, ₹200 and ₹100", async () => {
    const id = await saveExpense(
      db,
      groupId,
      dinner({
        splitType: "shares",
        parts: [
          { memberId: asha, shares: 3 },
          { memberId: ravi, shares: 2 },
          { memberId: meera, shares: 1 },
        ],
      }),
      "asha@example.com",
    );
    const expense = (await getExpense(db, groupId, id))!;
    expect(expense.splits).toEqual([
      { memberId: asha, shares: 3, amountMinor: 30000 },
      { memberId: ravi, shares: 2, amountMinor: 20000 },
      { memberId: meera, shares: 1, amountMinor: 10000 },
    ]);
  });

  it("converts a $30.00 expense at 83.50 into ₹2,505.00 and splits the rupee amount", async () => {
    const id = await saveExpense(
      db,
      groupId,
      dinner({ amountMinor: 3000, currency: "USD", fxRate: 83.5 }),
      "asha@example.com",
    );
    const expense = (await getExpense(db, groupId, id))!;
    expect([expense.amountMinor, expense.currency, expense.fxRate, expense.baseAmountMinor]).toEqual([
      3000, "USD", 83.5, 250500,
    ]);
    expect(splitAmounts(expense)).toEqual({ [asha]: 83500, [ravi]: 83500, [meera]: 83500 });
  });

  it("forces the rate to 1 when the expense is in the base currency", async () => {
    const id = await saveExpense(db, groupId, dinner({ fxRate: 99 }), "asha@example.com");
    expect((await getExpense(db, groupId, id))!.baseAmountMinor).toBe(60000);
  });

  it("refuses a foreign currency expense without a valid rate", async () => {
    await expect(
      saveExpense(db, groupId, dinner({ currency: "USD", fxRate: 0 }), "asha@example.com"),
    ).rejects.toThrow("Exchange rate to INR must be more than zero");
  });

  it("refuses a split with nobody in it", async () => {
    await expect(
      saveExpense(db, groupId, dinner({ parts: [{ memberId: asha, shares: 0 }] }), "asha@example.com"),
    ).rejects.toThrow("Pick at least one person");
  });

  it("refuses a member from another group", async () => {
    const other = await createGroup(db, {
      name: "Other",
      baseCurrency: "INR",
      creatorName: "Zed",
      creatorEmail: "zed@example.com",
    });
    await expect(
      saveExpense(db, groupId, dinner({ paidBy: other.memberId }), "asha@example.com"),
    ).rejects.toThrow("must be a member of this group");
  });

  it("replaces the splits when an expense is edited", async () => {
    const id = await saveExpense(db, groupId, dinner(), "asha@example.com");
    await saveExpense(
      db,
      groupId,
      dinner({ description: "Dinner + dessert", amountMinor: 1000, parts: [{ memberId: ravi, shares: 1 }] }),
      "ravi@example.com",
      id,
    );
    const expense = (await getExpense(db, groupId, id))!;
    expect(expense.description).toBe("Dinner + dessert");
    expect(expense.createdBy).toBe("asha@example.com");
    expect(splitAmounts(expense)).toEqual({ [ravi]: 1000 });
  });

  it("does not edit an expense through another group's id", async () => {
    const id = await saveExpense(db, groupId, dinner(), "asha@example.com");
    const other = await createGroup(db, {
      name: "Other",
      baseCurrency: "INR",
      creatorName: "Zed",
      creatorEmail: "zed@example.com",
    });
    await expect(
      saveExpense(
        db,
        other.groupId,
        dinner({ paidBy: other.memberId, parts: [{ memberId: other.memberId, shares: 1 }] }),
        "zed@example.com",
        id,
      ),
    ).rejects.toThrow("Expense not found");
  });

  it("lists newest spending date first and deletes with splits", async () => {
    const older = await saveExpense(db, groupId, dinner({ spentOn: "2026-10-01" }), "asha@example.com");
    const newer = await saveExpense(db, groupId, dinner({ spentOn: "2026-10-05" }), "asha@example.com");
    expect((await listExpenses(db, groupId)).map((e) => e.id)).toEqual([newer, older]);

    await deleteExpense(db, groupId, newer);
    expect((await listExpenses(db, groupId)).map((e) => e.id)).toEqual([older]);
  });
});

describe("recording a payment", () => {
  it("stores who paid whom and how much", async () => {
    await recordPayment(
      db,
      groupId,
      { fromMember: ravi, toMember: asha, amountMinor: 20000, paidOn: "2026-11-02" },
      "ravi@example.com",
    );
    expect(await listPayments(db, groupId)).toMatchObject([
      { fromMember: ravi, toMember: asha, amountMinor: 20000, paidOn: "2026-11-02" },
    ]);
  });

  it("refuses a payment to yourself", async () => {
    await expect(
      recordPayment(
        db,
        groupId,
        { fromMember: ravi, toMember: ravi, amountMinor: 100, paidOn: "2026-11-02" },
        "ravi@example.com",
      ),
    ).rejects.toThrow("two different people");
  });
});

describe("changing group settings", () => {
  it("allows a base currency change while the group has no expenses", async () => {
    await updateGroup(db, groupId, { name: "Goa 2026", baseCurrency: "USD" });
    expect(await getGroup(db, groupId)).toMatchObject({ name: "Goa 2026", baseCurrency: "USD" });
  });

  it("blocks a base currency change after the first expense but still allows a rename", async () => {
    await saveExpense(db, groupId, dinner(), "asha@example.com");
    await expect(updateGroup(db, groupId, { name: "Goa", baseCurrency: "USD" })).rejects.toThrow(
      "only change before the first expense",
    );
    await updateGroup(db, groupId, { name: "Goa renamed", baseCurrency: "INR" });
    expect((await getGroup(db, groupId))!.name).toBe("Goa renamed");
  });
});
