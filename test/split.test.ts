import { describe, expect, it } from "vitest";
import { allocateByShares } from "@/lib/split";

const amounts = (result: { memberId: number; amountMinor: number }[]) =>
  Object.fromEntries(result.map((r) => [r.memberId, r.amountMinor]));

describe("splitting a total by parts", () => {
  it("splits ₹600.00 as 3/2/1 parts into ₹300, ₹200 and ₹100", () => {
    const result = allocateByShares(60000, [
      { memberId: 1, shares: 3 },
      { memberId: 2, shares: 2 },
      { memberId: 3, shares: 1 },
    ]);
    expect(amounts(result)).toEqual({ 1: 30000, 2: 20000, 3: 10000 });
  });

  it("splits ₹100.00 equally between 3 people as 3334/3333/3333 paise so nothing is lost", () => {
    const result = allocateByShares(10000, [
      { memberId: 1, shares: 1 },
      { memberId: 2, shares: 1 },
      { memberId: 3, shares: 1 },
    ]);
    expect(amounts(result)).toEqual({ 1: 3334, 2: 3333, 3: 3333 });
  });

  it("gives the leftover paisa to the person with the largest remainder, not the first", () => {
    const result = allocateByShares(100, [
      { memberId: 1, shares: 1 },
      { memberId: 2, shares: 2 },
    ]);
    expect(amounts(result)).toEqual({ 1: 33, 2: 67 });
  });

  it("leaves out people with zero parts", () => {
    const result = allocateByShares(900, [
      { memberId: 1, shares: 0 },
      { memberId: 2, shares: 1 },
      { memberId: 3, shares: 2 },
    ]);
    expect(amounts(result)).toEqual({ 2: 300, 3: 600 });
  });

  it("refuses a split where nobody has a part", () => {
    expect(() => allocateByShares(900, [{ memberId: 1, shares: 0 }])).toThrow(
      "At least one person must have a share",
    );
  });
});
