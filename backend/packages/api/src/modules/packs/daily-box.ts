import { computeOdds } from '@acme/odds-math';

// Authoring validation + odds folding + draw selection for daily reward boxes.
// Same win-lock semantics as pack odds: locked rows pin an exact pct, unlocked
// rows share the remainder (equally — boxes have no rarity axis, so every row
// maps to the same odds-math rarity).
export const MAX_BOX_CREDIT_MYR = 10_000;

export type BoxPrizeKind = 'credit' | 'product' | 'voucher' | 'nothing';
export type BoxPrizeInput = {
  kind: BoxPrizeKind;
  locked: boolean;
  pct: number;
  amount_myr?: number;
  product_handle?: string;
  qty?: number;
};
export type DailyBoxBody = {
  name: string;
  enabled: boolean;
  draws_per_day: number;
  reason: string;
  prizes: BoxPrizeInput[];
};

const KINDS: BoxPrizeKind[] = ['credit', 'product', 'voucher', 'nothing'];

export function validateDailyBox(raw: unknown): DailyBoxBody {
  const b = raw as Partial<DailyBoxBody> | null;
  if (!b || typeof b !== 'object') throw new Error('Invalid body.');
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const enabled = b.enabled === true;
  const draws = Number(b.draws_per_day);
  if (!Number.isInteger(draws) || draws < 1 || draws > 10) {
    throw new Error('draws_per_day must be an integer between 1 and 10.');
  }
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (!reason) throw new Error('A reason is required for the audit trail.');
  const prizes = Array.isArray(b.prizes) ? b.prizes : [];
  if (enabled && prizes.length === 0) {
    throw new Error('An enabled box needs at least one prize.');
  }
  const out: BoxPrizeInput[] = prizes.map((p, i) => {
    if (!p || !KINDS.includes(p.kind as BoxPrizeKind)) {
      throw new Error(`Prize ${i + 1}: unknown kind.`);
    }
    const locked = p.locked === true;
    const pct = Number(p.pct);
    if (locked && !(Number.isFinite(pct) && pct > 0 && pct <= 100)) {
      throw new Error(`Prize ${i + 1}: locked win % must be between 0 and 100.`);
    }
    if (p.kind === 'credit' || p.kind === 'voucher') {
      const amt = Number(p.amount_myr);
      if (!(Number.isFinite(amt) && amt > 0 && amt <= MAX_BOX_CREDIT_MYR)) {
        throw new Error(`Prize ${i + 1}: amount must be within the RM ${MAX_BOX_CREDIT_MYR.toLocaleString()} ceiling.`);
      }
      return { kind: p.kind, locked, pct: locked ? pct : 0, amount_myr: amt };
    }
    if (p.kind === 'product') {
      const handle = typeof p.product_handle === 'string' ? p.product_handle.trim() : '';
      if (!handle) throw new Error(`Prize ${i + 1}: a product must be selected.`);
      const qty = Number(p.qty ?? 1);
      if (!Number.isInteger(qty) || qty < 1) throw new Error(`Prize ${i + 1}: qty must be an integer ≥ 1.`);
      // ponytail: qty restricted to 1 — multi-qty needs per-pull draw linkage (reward_draw.vault_pull_id is single)
      if (qty !== 1) throw new Error(`Prize ${i + 1}: qty must be 1 (multi-qty prizes are not yet supported).`);
      return { kind: 'product', locked, pct: locked ? pct : 0, product_handle: handle, qty };
    }
    return { kind: 'nothing', locked, pct: locked ? pct : 0 };
  });
  return { name, enabled, draws_per_day: draws, reason, prizes: out };
}

export function computeBoxWeights(
  prizes: BoxPrizeInput[],
): { weight: number; locked: boolean }[] {
  const result = computeOdds(
    prizes.map((p, i) => ({
      card_id: String(i),
      locked: p.locked,
      pct: p.locked ? p.pct : 0,
      rarity: 'Common',
    })),
  );
  if (result.error) throw new Error(result.error);
  const byId = new Map(result.computed.map((c) => [c.card_id, c]));
  return prizes.map((_, i) => {
    const c = byId.get(String(i));
    if (!c) throw new Error('Odds computation dropped a prize row.');
    return { weight: c.weight, locked: c.locked };
  });
}

export function pickPrize<T extends { weight: number }>(prizes: T[], roll: number): T {
  let acc = 0;
  for (const p of prizes) {
    acc += p.weight;
    if (roll < acc) return p;
  }
  throw new Error('Prize weights do not cover the roll — box odds are invalid.');
}
