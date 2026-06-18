import { describe, it, expect } from 'vitest';
import {
  reelTarget,
  buildStrip,
  ITEM_W,
  STRIP_LEN,
  WIN_INDEX,
} from '@/lib/reel';
import type { Rarity } from '@/app/claw/packs-data';

const POOL: Rarity[] = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];

describe('reelTarget', () => {
  it('centers the winner index under the payline', () => {
    // 36*124 + 124/2 - 600/2 = 4464 + 62 - 300 = 4226
    expect(reelTarget(36, 124, 600)).toBe(4226);
  });

  it('shifts left as the window widens (winner stays centered)', () => {
    expect(reelTarget(36, 124, 800)).toBe(reelTarget(36, 124, 600) - 100);
  });

  it('uses the shipped constants by default geometry', () => {
    expect(ITEM_W).toBe(124);
    expect(WIN_INDEX).toBe(36);
    expect(STRIP_LEN).toBe(48);
  });
});

describe('buildStrip', () => {
  it('places the winner rarity exactly at WIN_INDEX', () => {
    const strip = buildStrip('Legendary', POOL, STRIP_LEN, WIN_INDEX);
    expect(strip).toHaveLength(STRIP_LEN);
    expect(strip[WIN_INDEX]).toBe('Legendary');
  });

  it('fills every non-winner cell from the pool', () => {
    const strip = buildStrip('Epic', POOL, STRIP_LEN, WIN_INDEX);
    strip.forEach((r, i) => {
      if (i !== WIN_INDEX) expect(POOL).toContain(r);
    });
  });

  it('is deterministic for the same inputs', () => {
    expect(buildStrip('Rare', POOL, STRIP_LEN, WIN_INDEX)).toEqual(
      buildStrip('Rare', POOL, STRIP_LEN, WIN_INDEX),
    );
  });

  it('throws when winIndex is out of bounds', () => {
    expect(() => buildStrip('Rare', POOL, STRIP_LEN, STRIP_LEN)).toThrow(
      RangeError,
    );
    expect(() => buildStrip('Rare', POOL, STRIP_LEN, -1)).toThrow(RangeError);
  });

  it('throws when length is not a positive integer', () => {
    expect(() => buildStrip('Rare', POOL, 0, 0)).toThrow(RangeError);
  });
});
