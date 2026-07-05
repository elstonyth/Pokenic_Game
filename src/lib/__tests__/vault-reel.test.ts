import { describe, expect, test } from 'vitest';
import {
  WINDUP_MS,
  BLUR_MS,
  FRICTION_MS,
  CRAWL_MS,
  SETTLE_MS,
  STOP_STAGGER_MS,
  columnDurationMs,
  spinTotalMs,
  spinOffset,
  cellCurve,
  blurStretch,
} from '@/lib/vault-reel';

const ITEM_H = 112;
const TARGET = 3000;

describe('columnDurationMs', () => {
  test('non-last column has no crawl phase', () => {
    expect(columnDurationMs(0, 3)).toBe(
      WINDUP_MS + BLUR_MS + FRICTION_MS + SETTLE_MS,
    );
  });
  test('last column adds crawl', () => {
    expect(columnDurationMs(2, 3)).toBe(
      WINDUP_MS +
        BLUR_MS +
        FRICTION_MS +
        CRAWL_MS +
        SETTLE_MS +
        2 * STOP_STAGGER_MS,
    );
  });
  test('single column IS the last column (crawl included)', () => {
    expect(columnDurationMs(0, 1)).toBe(
      WINDUP_MS + BLUR_MS + FRICTION_MS + CRAWL_MS + SETTLE_MS,
    );
  });
  test('stagger extends duration per column index', () => {
    expect(columnDurationMs(1, 3) - columnDurationMs(0, 3)).toBe(
      STOP_STAGGER_MS,
    );
  });
});

describe('spinTotalMs', () => {
  test('equals the last column duration', () => {
    expect(spinTotalMs(3)).toBe(columnDurationMs(2, 3));
    expect(spinTotalMs(1)).toBe(columnDurationMs(0, 1));
  });
});

describe('spinOffset', () => {
  // Direction contract (spec decision #22): cells stream TOP → BOTTOM. The
  // winner starts ABOVE the payline (offset HIGH = target + pre-roll travel) and
  // DESCENDS to `target` (offset falls). Wind-up pulls UP (offset spikes above
  // the start), settle overshoots BELOW the target (offset dips under it).
  test('starts HIGH (above the target) and ends exactly at target', () => {
    const start = spinOffset(0, TARGET, 0, 1, ITEM_H);
    expect(start).toBeGreaterThan(TARGET); // winner begins above the payline
    expect(spinOffset(spinTotalMs(1), TARGET, 0, 1, ITEM_H)).toBe(TARGET);
    expect(spinOffset(spinTotalMs(1) + 5000, TARGET, 0, 1, ITEM_H)).toBe(
      TARGET,
    );
  });
  test('wind-up pulls UP: offset rises ABOVE the start position', () => {
    const start = spinOffset(0, TARGET, 0, 1, ITEM_H);
    const mid = spinOffset(WINDUP_MS / 2, TARGET, 0, 1, ITEM_H);
    // pulled up by up to half a cell beyond the start
    expect(mid).toBeGreaterThan(start);
    expect(mid).toBeLessThanOrEqual(start + ITEM_H / 2 + 0.001);
  });
  test('monotonically DECREASING (cells descend) after wind-up until settle', () => {
    const dur = columnDurationMs(0, 1);
    let prev = spinOffset(WINDUP_MS, TARGET, 0, 1, ITEM_H);
    for (let t = WINDUP_MS + 16; t <= dur - SETTLE_MS; t += 16) {
      const cur = spinOffset(t, TARGET, 0, 1, ITEM_H);
      expect(cur).toBeLessThanOrEqual(prev + 0.001);
      prev = cur;
    }
  });
  test('settle overshoots BELOW target by at most 0.6 cells', () => {
    const dur = columnDurationMs(0, 1);
    let minSeen = Infinity;
    for (let t = dur - SETTLE_MS; t <= dur; t += 8) {
      minSeen = Math.min(minSeen, spinOffset(t, TARGET, 0, 1, ITEM_H));
    }
    expect(minSeen).toBeLessThan(TARGET); // it does overshoot (downward)
    expect(minSeen).toBeGreaterThanOrEqual(TARGET - ITEM_H * 0.6);
  });
  test('non-last column skips crawl (still lands exactly on target)', () => {
    const durNonLast = columnDurationMs(0, 2);
    expect(spinOffset(durNonLast, TARGET, 0, 2, ITEM_H)).toBe(TARGET);
  });
});

describe('cellCurve', () => {
  test('center cell is identity', () => {
    const c = cellCurve(0, 280);
    expect(c.rotateXDeg).toBe(0);
    expect(c.scale).toBe(1);
    expect(c.brightness).toBe(1);
    expect(c.translateZPx).toBe(0);
  });
  test('symmetric rotation, mirrored sign', () => {
    const up = cellCurve(-140, 280);
    const down = cellCurve(140, 280);
    expect(up.rotateXDeg).toBeCloseTo(-down.rotateXDeg);
    expect(up.scale).toBeCloseTo(down.scale);
    expect(up.brightness).toBeCloseTo(down.brightness);
  });
  test('clamps beyond the radius', () => {
    expect(cellCurve(9999, 280)).toEqual(cellCurve(280, 280));
  });
});

describe('blurStretch', () => {
  test('at rest: no stretch, full opacity', () => {
    expect(blurStretch(0)).toEqual({ scaleY: 1, opacity: 1 });
  });
  test('stretch and dim are clamped at high velocity', () => {
    const fast = blurStretch(50);
    expect(fast.scaleY).toBeLessThanOrEqual(1.35);
    expect(fast.opacity).toBeGreaterThanOrEqual(0.55);
  });
});
