// Pure presentation helpers for the Transactions account page. Isomorphic (no
// server-only imports) so the server component can call them directly.
import type { CreditReason } from '@/lib/data/schemas';
import { rm } from '@/lib/format';

// Keeps its typed record over the KNOWN reason enum (exhaustiveness still
// checked for every reason the storefront knows about) — only the lookup
// below widens to accept any string.
const REASON_LABEL: Record<CreditReason, string> = {
  topup: 'Top-up',
  pack_open: 'Pack open',
  buyback: 'Sell-back',
  adjustment: 'Adjustment',
  direct_referral: 'Referral commission',
  team_override: 'Team override',
  commission_reversal: 'Commission reversal',
  cashout: 'Cashout',
  voucher_claim: 'Voucher',
  reward_credit: 'Reward credit',
  daily_reward: 'Daily reward',
};

// A backend reason added before the storefront redeploys has no entry in
// REASON_LABEL — prettify it generically ('refund_x' -> 'Refund x') instead
// of the row being unlabeled or dropped (audit 2026-07-07 #11).
export const reasonLabel = (reason: string): string =>
  (REASON_LABEL as Record<string, string>)[reason] ??
  reason.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** "+RM 48.00" for credits, "-RM 25.00" for spends (amount carries the sign). */
export function signedRm(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${rm(Math.abs(amount))}`;
}
