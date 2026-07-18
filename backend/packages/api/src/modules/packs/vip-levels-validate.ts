import { MedusaError } from '@medusajs/framework/utils';
import { FRAME_LEVELS } from './avatar-frames';

// POST /admin/vip-levels body → the full renumbered ladder. Pure cross-row
// validation (contiguity, monotonic thresholds, decade-only frames, non-
// negatives). The box_tier-exists check is a service-level DB lookup, NOT here.
export interface VipLevelInput {
  level: number;
  spend_threshold: number;
  voucher_amount: number;
  box_tier: string;
  frame_unlock: boolean;
  direct_referral_pct: number;
}

const bad = (m: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, m);
};

export function validateVipLevels(raw: unknown): VipLevelInput[] {
  const body = (raw as { levels?: unknown } | null)?.levels;
  if (!Array.isArray(body)) bad('levels must be an array.');
  const rows = body as unknown[];
  if (rows.length < 1) bad('The VIP ladder must have at least 1 level.');

  const out: VipLevelInput[] = [];
  let prevThreshold = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] ?? {}) as Record<string, unknown>;
    const level = i + 1;
    if (r.level !== level)
      bad(
        `level at position ${i} must be ${level} (contiguous 1..N); got ${String(r.level)}.`,
      );

    const threshold = r.spend_threshold;
    if (typeof threshold !== 'number' || !Number.isFinite(threshold))
      bad(`level ${level}: spend_threshold must be a number.`);
    const t = threshold as number;
    if (level === 1 && t !== 0) bad('level 1: spend_threshold must be 0.');
    if (t < 0) bad(`level ${level}: spend_threshold must be >= 0.`);
    if (level > 1 && !(t > prevThreshold))
      bad(`level ${level}: spend_threshold must exceed level ${level - 1}'s.`);
    prevThreshold = t;

    const voucher = r.voucher_amount;
    if (typeof voucher !== 'number' || !Number.isFinite(voucher) || voucher < 0)
      bad(`level ${level}: voucher_amount must be >= 0.`);

    const pct = r.direct_referral_pct;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0)
      bad(`level ${level}: direct_referral_pct must be >= 0.`);

    if (typeof r.box_tier !== 'string' || r.box_tier.trim().length === 0)
      bad(`level ${level}: box_tier is required.`);

    if (typeof r.frame_unlock !== 'boolean')
      bad(`level ${level}: frame_unlock must be a boolean.`);
    if (
      r.frame_unlock &&
      !(FRAME_LEVELS as readonly number[]).includes(level)
    )
      bad(
        `level ${level}: frame_unlock may only be true on decade levels (10, 20, … 100).`,
      );

    out.push({
      level,
      spend_threshold: t,
      voucher_amount: voucher as number,
      box_tier: (r.box_tier as string).trim(),
      frame_unlock: r.frame_unlock as boolean,
      direct_referral_pct: pct as number,
    });
  }
  return out;
}
