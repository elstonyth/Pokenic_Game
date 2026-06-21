// Pure external-funded consume math. A spend of `priceSen` draws from the
// customer's remaining external-funded balance first; it can never draw more
// than is available, nor a negative amount. Kept DB-free so it is unit-testable
// like vip-ladder.ts / credit-summary.ts. All inputs/outputs are integer sen.
export function consumeExternalSen(
  priceSen: number,
  externalBalanceSen: number,
): number {
  const price = priceSen > 0 ? priceSen : 0;
  const available = externalBalanceSen > 0 ? externalBalanceSen : 0;
  return Math.min(price, available);
}
