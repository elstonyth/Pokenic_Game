import type { BigNumberValue } from "@medusajs/types";

// The single coercion from a stored money value (Medusa numeric column →
// BigNumber | numeric string | number) to a JSON-safe JS number. Behavior-
// preserving replacement for the ~15 inline `Number(card.market_value)` /
// `Number(pack.price)` call sites: it is exactly `Number(value)`, centralized
// so the rounding/serialization rule lives in one place. USD decimals, never
// cents.
export function toMoney(
  value: BigNumberValue | number | string | null | undefined
): number {
  return Number(value);
}
