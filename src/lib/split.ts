export type SplitType = "equal" | "shares";

export type Allocation = { memberId: number; shares: number; amountMinor: number };

export function allocateByShares(
  totalMinor: number,
  parts: { memberId: number; shares: number }[],
): Allocation[] {
  const active = parts.filter((p) => p.shares > 0);
  const totalShares = active.reduce((sum, p) => sum + p.shares, 0);
  if (totalShares === 0) throw new Error("At least one person must have a share");

  const exact = active.map((p) => {
    const product = totalMinor * p.shares;
    return {
      ...p,
      floor: Math.floor(product / totalShares),
      remainder: product % totalShares,
    };
  });

  let leftover = totalMinor - exact.reduce((sum, p) => sum + p.floor, 0);
  const byRemainder = [...exact].sort(
    (a, b) => b.remainder - a.remainder || a.memberId - b.memberId,
  );
  const extra = new Map<number, number>();
  for (const p of byRemainder) {
    if (leftover === 0) break;
    extra.set(p.memberId, 1);
    leftover -= 1;
  }

  return exact.map((p) => ({
    memberId: p.memberId,
    shares: p.shares,
    amountMinor: p.floor + (extra.get(p.memberId) ?? 0),
  }));
}
