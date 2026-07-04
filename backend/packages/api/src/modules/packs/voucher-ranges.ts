// Pure fold/collapse between the admin range editor ({from,to,amount}[]) and the
// stored per-level ladder (vip_level.voucher_amount for levels 1..100).
export type VoucherRange = { from: number; to: number; amount_myr: number };

const LEVELS = 100;

export function foldRanges(ranges: VoucherRange[]): number[] {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new Error('At least one range is required.');
  }
  const out = new Array<number>(LEVELS).fill(-1);
  for (const r of ranges) {
    if (
      !Number.isInteger(r.from) || !Number.isInteger(r.to) ||
      r.from < 1 || r.to > LEVELS || r.from > r.to
    ) {
      throw new Error(`Invalid range ${r.from}–${r.to}: levels must be integers within 1–${LEVELS}.`);
    }
    if (!(Number.isFinite(r.amount_myr) && r.amount_myr >= 0)) {
      throw new Error(`Invalid amount for range ${r.from}–${r.to}: must be ≥ 0.`);
    }
    for (let level = r.from; level <= r.to; level++) {
      if (out[level - 1] !== -1) {
        throw new Error(`Ranges overlap at level ${level}.`);
      }
      out[level - 1] = r.amount_myr;
    }
  }
  const gapAt = out.indexOf(-1);
  if (gapAt !== -1) {
    throw new Error(`Gap: level ${gapAt + 1} is not covered by any range.`);
  }
  return out;
}

export function collapseLadder(amounts: number[]): VoucherRange[] {
  const ranges: VoucherRange[] = [];
  for (let i = 0; i < amounts.length; i++) {
    const last = ranges[ranges.length - 1];
    if (last && last.amount_myr === amounts[i]) last.to = i + 1;
    else ranges.push({ from: i + 1, to: i + 1, amount_myr: amounts[i] });
  }
  return ranges;
}
