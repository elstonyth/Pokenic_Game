// Which buyback rate applies to a pull — the single source of truth shared by
// the buyback workflow (what actually gets credited) and the vault route (the
// offer shown). The two must agree or the vault would quote one amount and
// credit another.
//
// Model: a sell-back within the INSTANT WINDOW after the pull gets the pack's
// instant rate (buyback_percent — the "sell on the spot" offer at the reveal);
// after the window it gets vault_buyback_percent. Time-based so the better
// rate can't be claimed later by replaying the reveal's API call.

export type BuybackRateType = "instant" | "vault";

export type BuybackRate = {
  /** % of current FMV credited (0–100). */
  percent: number;
  rate_type: BuybackRateType;
};

// Default when the source pack was deleted after the pull — matches the seed's
// Pack.buyback_percent default.
const FALLBACK_PERCENT = 90;

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

// Env-tunable like the rate limits; invalid values fall back, never 0 (a 0ms
// window would silently kill the instant rate).
export function instantBuybackWindowMs(): number {
  const raw = process.env.BUYBACK_INSTANT_WINDOW_MS;
  if (raw === undefined || raw === "") return DEFAULT_WINDOW_MS;
  const floored = Math.floor(Number(raw));
  return Number.isSafeInteger(floored) && floored > 0
    ? floored
    : DEFAULT_WINDOW_MS;
}

const sanePercent = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

export function resolveBuybackRate(
  pack:
    | { buyback_percent: unknown; vault_buyback_percent: unknown }
    | undefined
    | null,
  rolledAt: Date | string,
  nowMs: number = Date.now()
): BuybackRate {
  const rolledMs = new Date(rolledAt).getTime();
  // An unparsable rolled_at counts as outside the window — the vault rate is
  // the conservative default.
  const isInstant =
    Number.isFinite(rolledMs) && nowMs - rolledMs <= instantBuybackWindowMs();

  const percent = isInstant
    ? sanePercent(pack?.buyback_percent) ?? FALLBACK_PERCENT
    : sanePercent(pack?.vault_buyback_percent) ??
      sanePercent(pack?.buyback_percent) ??
      FALLBACK_PERCENT;

  return { percent, rate_type: isInstant ? "instant" : "vault" };
}
