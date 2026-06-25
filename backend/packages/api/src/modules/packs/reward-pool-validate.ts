import { MedusaError } from '@medusajs/framework/utils';

// E1 — validator for the admin reward-pool authoring POST body.
//
// Mirrors the DB cross-column CHECK (pack_odds_kind_payout_check):
//   product  → product_handle set, credit_amount null
//   credit   → credit_amount > 0, product_handle null
//   nothing  → both null
//
// credit_amount is decimal MYR (bigNumber field) — validated as a positive
// finite number. weights must be positive integers. draws_per_day >= 0.

const bad = (m: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, m);
};

export type RewardPoolEntry = {
  kind: 'product' | 'credit' | 'nothing';
  product_handle?: string | null;
  credit_amount?: number | null;
  weight: number;
};

export type RewardPoolBody = {
  entries: RewardPoolEntry[];
  draws_per_day: number;
  pool_enabled: boolean;
};

export function validateRewardPool(raw: unknown): RewardPoolBody {
  if (!raw || typeof raw !== 'object') bad('Body must be an object.');
  const b = raw as Record<string, unknown>;

  // draws_per_day: integer >= 0
  if (b.draws_per_day === undefined || b.draws_per_day === null) {
    bad("'draws_per_day' is required.");
  }
  const dpd =
    typeof b.draws_per_day === 'string'
      ? Number(b.draws_per_day)
      : (b.draws_per_day as unknown);
  if (typeof dpd !== 'number' || !Number.isInteger(dpd) || dpd < 0) {
    bad("'draws_per_day' must be an integer >= 0.");
  }

  // pool_enabled: boolean
  if (typeof b.pool_enabled !== 'boolean') {
    bad("'pool_enabled' must be a boolean.");
  }

  // entries: non-empty array
  if (!Array.isArray(b.entries) || b.entries.length === 0) {
    bad("'entries' must be a non-empty array.");
  }

  const entries: RewardPoolEntry[] = (b.entries as unknown[]).map(
    (raw_entry, i) => {
      if (!raw_entry || typeof raw_entry !== 'object') {
        bad(`entries[${i}]: must be an object.`);
      }
      const e = raw_entry as Record<string, unknown>;
      const prefix = `entries[${i}]`;

      // kind: 'product' | 'credit' | 'nothing'
      if (!['product', 'credit', 'nothing'].includes(e.kind as string)) {
        bad(`${prefix}.kind must be 'product', 'credit', or 'nothing'.`);
      }
      const kind = e.kind as 'product' | 'credit' | 'nothing';

      // weight: positive integer
      const w =
        typeof e.weight === 'string' ? Number(e.weight) : (e.weight as unknown);
      if (typeof w !== 'number' || !Number.isInteger(w) || w <= 0) {
        bad(`${prefix}.weight must be a positive integer.`);
      }
      const weight = w as number;

      // kind <-> payout exclusivity (mirrors DB CHECK)
      if (kind === 'product') {
        if (
          typeof e.product_handle !== 'string' ||
          (e.product_handle as string).trim() === ''
        ) {
          bad(
            `${prefix}: kind='product' requires a non-empty product_handle.`,
          );
        }
        if (e.credit_amount != null) {
          bad(`${prefix}: kind='product' must not have credit_amount.`);
        }
        return {
          kind,
          product_handle: (e.product_handle as string).trim(),
          credit_amount: null,
          weight,
        };
      }

      if (kind === 'credit') {
        if (e.product_handle != null) {
          bad(`${prefix}: kind='credit' must not have product_handle.`);
        }
        const ca =
          typeof e.credit_amount === 'string'
            ? Number(e.credit_amount)
            : (e.credit_amount as unknown);
        if (
          typeof ca !== 'number' ||
          !Number.isFinite(ca) ||
          ca <= 0
        ) {
          bad(`${prefix}: kind='credit' requires credit_amount > 0 (decimal MYR).`);
        }
        return {
          kind,
          product_handle: null,
          credit_amount: ca as number,
          weight,
        };
      }

      // nothing
      if (e.product_handle != null) {
        bad(`${prefix}: kind='nothing' must not have product_handle.`);
      }
      if (e.credit_amount != null) {
        bad(`${prefix}: kind='nothing' must not have credit_amount.`);
      }
      return { kind, product_handle: null, credit_amount: null, weight };
    },
  );

  return {
    entries,
    draws_per_day: dpd as number,
    pool_enabled: b.pool_enabled as boolean,
  };
}
