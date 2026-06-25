import type { RewardPoolEntryView, RewardPoolBody } from './admin-rest';

export type RewardKind = 'product' | 'credit' | 'nothing';

// One editable row. Numeric fields are kept as strings so the operator can type
// freely; localId is a client-only key (nothing/credit rows have no stable id).
export type RewardEditRow = {
  localId: string;
  kind: RewardKind;
  product_handle: string | null;
  credit_amount: string;
  weight: string;
};

let _seq = 0;
const nextLocalId = (): string => `row-${_seq++}`;

export const mapPoolToRows = (
  entries: RewardPoolEntryView[],
): RewardEditRow[] =>
  entries.map((e) => ({
    localId: nextLocalId(),
    kind: e.kind,
    product_handle: e.product_handle,
    credit_amount: e.credit_amount != null ? String(e.credit_amount) : '',
    weight: String(e.weight),
  }));

export const blankRow = (): RewardEditRow => ({
  localId: nextLocalId(),
  kind: 'nothing',
  product_handle: null,
  credit_amount: '',
  weight: '1',
});

// Odds preview = weight / Σweight × 100 over rows with a positive integer weight.
// Returns 0 for every row when Σweight is 0 so the % cell never renders NaN.
export const rowProbabilities = (
  rows: RewardEditRow[],
): Map<string, number> => {
  const weights = rows.map((r) => {
    const w = Number(r.weight);
    return Number.isInteger(w) && w > 0 ? w : 0;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  const out = new Map<string, number>();
  rows.forEach((r, i) => {
    out.set(r.localId, total > 0 ? (weights[i] / total) * 100 : 0);
  });
  return out;
};

// Per-row client validity (UX fail-fast; the backend validator is the backstop).
export const rowError = (r: RewardEditRow): string | null => {
  const w = Number(r.weight);
  if (!Number.isInteger(w) || w <= 0)
    return 'Weight must be a positive whole number.';
  if (
    r.kind === 'product' &&
    (!r.product_handle || r.product_handle.trim() === '')
  )
    return 'Pick a product for this entry.';
  if (r.kind === 'credit') {
    const c = Number(r.credit_amount);
    if (!Number.isFinite(c) || c <= 0)
      return 'Credit amount must be greater than 0.';
  }
  return null;
};

// Editable buffer → POST body. Drops the inapplicable payout field per kind so
// the request matches the validator's exclusivity rule.
export const rowsToBody = (
  rows: RewardEditRow[],
  drawsPerDay: number,
  poolEnabled: boolean,
): RewardPoolBody => ({
  draws_per_day: drawsPerDay,
  pool_enabled: poolEnabled,
  entries: rows.map((r) => {
    const weight = Number(r.weight);
    if (r.kind === 'product')
      return { kind: 'product', product_handle: r.product_handle, weight };
    if (r.kind === 'credit')
      return { kind: 'credit', credit_amount: Number(r.credit_amount), weight };
    return { kind: 'nothing', weight };
  }),
});
