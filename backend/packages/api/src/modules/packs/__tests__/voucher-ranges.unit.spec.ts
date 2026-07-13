import { foldRanges, collapseLadder, MAX_VOUCHER_MYR, type VoucherRange } from '../voucher-ranges';

const full = (amount = 0): VoucherRange[] => [{ from: 1, to: 100, amount_myr: amount }];

describe('foldRanges', () => {
  test('single full range fills all 100 levels', () => {
    const out = foldRanges(full(5));
    expect(out).toHaveLength(100);
    expect(out[0]).toBe(5);
    expect(out[99]).toBe(5);
  });
  test('multiple ranges map to the right levels', () => {
    const out = foldRanges([
      { from: 1, to: 9, amount_myr: 0 },
      { from: 10, to: 99, amount_myr: 10 },
      { from: 100, to: 100, amount_myr: 888 },
    ]);
    expect(out[0]).toBe(0);   // L1
    expect(out[8]).toBe(0);   // L9
    expect(out[9]).toBe(10);  // L10
    expect(out[98]).toBe(10); // L99
    expect(out[99]).toBe(888);// L100
  });
  test('rejects overlap', () => {
    expect(() => foldRanges([
      { from: 1, to: 50, amount_myr: 1 },
      { from: 50, to: 100, amount_myr: 2 },
    ])).toThrow(/overlap/i);
  });
  test('rejects gap', () => {
    expect(() => foldRanges([
      { from: 1, to: 40, amount_myr: 1 },
      { from: 42, to: 100, amount_myr: 2 },
    ])).toThrow(/gap/i);
  });
  test('rejects out-of-bounds, inverted, negative, non-integer', () => {
    expect(() => foldRanges([{ from: 0, to: 100, amount_myr: 1 }])).toThrow();
    expect(() => foldRanges([{ from: 1, to: 101, amount_myr: 1 }])).toThrow();
    expect(() => foldRanges([{ from: 10, to: 5, amount_myr: 1 }])).toThrow();
    expect(() => foldRanges([{ from: 1, to: 100, amount_myr: -1 }])).toThrow();
    expect(() => foldRanges([{ from: 1.5, to: 100, amount_myr: 1 }])).toThrow();
    expect(() => foldRanges([])).toThrow();
  });
  test('accepts amount exactly at MAX_VOUCHER_MYR', () => {
    const out = foldRanges([{ from: 1, to: 100, amount_myr: MAX_VOUCHER_MYR }]);
    expect(out[0]).toBe(MAX_VOUCHER_MYR);
    expect(out[99]).toBe(MAX_VOUCHER_MYR);
  });
  test('rejects amount above MAX_VOUCHER_MYR', () => {
    expect(() => foldRanges([{ from: 1, to: 100, amount_myr: MAX_VOUCHER_MYR + 0.01 }]))
      .toThrow(/at most 2 decimals/i);
  });
  test('rejects non-cent-precise amount', () => {
    expect(() => foldRanges([{ from: 1, to: 100, amount_myr: 1.005 }]))
      .toThrow(/at most 2 decimals/i);
  });
  test('accepts the seeded 0–888 ladder (regression)', () => {
    const out = foldRanges([
      { from: 1, to: 9, amount_myr: 0 },
      { from: 10, to: 99, amount_myr: 10 },
      { from: 100, to: 100, amount_myr: 888 },
    ]);
    expect(out[99]).toBe(888);
  });
});

describe('collapseLadder', () => {
  test('merges adjacent equal amounts', () => {
    const amounts = [...Array(9).fill(0), ...Array(90).fill(10), 888];
    expect(collapseLadder(amounts)).toEqual([
      { from: 1, to: 9, amount_myr: 0 },
      { from: 10, to: 99, amount_myr: 10 },
      { from: 100, to: 100, amount_myr: 888 },
    ]);
  });
  test('round-trips with foldRanges', () => {
    const ranges: VoucherRange[] = [
      { from: 1, to: 1, amount_myr: 0 },
      { from: 2, to: 6, amount_myr: 2 },
      { from: 7, to: 9, amount_myr: 5 },
      { from: 10, to: 10, amount_myr: 50 },
      { from: 11, to: 50, amount_myr: 10 },
      { from: 51, to: 100, amount_myr: 50 },
    ];
    expect(collapseLadder(foldRanges(ranges))).toEqual(ranges);
  });
});
