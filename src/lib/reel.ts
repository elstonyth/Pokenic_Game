// Pure reel geometry, extracted from the proven mechanic in
// src/app/roulette/RouletteClient.tsx (translateX strip + center-landing). Kept
// pure so the slot reel and any future variant share one tested formula. No DOM,
// no React — see src/lib/__tests__/reel.test.ts.
import type { Rarity } from '@/app/claw/packs-data';

/** Reel cell width in CSS px (matches RouletteClient ITEM_W). */
export const ITEM_W = 124;
/** Fixed strip length — long enough to read as a real spin without wrap-looping. */
export const STRIP_LEN = 48;
/** The winner's index on the strip (high, so there's pre-roll travel). */
export const WIN_INDEX = 36;
/** Default per-row spin duration (ms). */
export const BASE_SPIN_MS = 4200;
/** Deceleration curve — the long tail IS the ease-out/anticipation. */
export const REEL_EASE = 'cubic-bezier(0.12,0.8,0.18,1)';

/**
 * Translate offset (px, positive) that centers `winIndex` under a center payline
 * for a window `winWidth` px wide. Apply as `translateX(-reelTarget(...))`.
 * Verbatim arithmetic from RouletteClient.tsx:74.
 */
export function reelTarget(
  winIndex: number,
  itemW: number,
  winWidth: number,
): number {
  return winIndex * itemW + itemW / 2 - winWidth / 2;
}

/**
 * A fixed-length strip of rarities with `winnerRarity` pinned at `winIndex`.
 * Non-winner cells cycle the pool deterministically (a real slot has a small
 * fixed symbol set). The rarity at a cell selects its Pokéball art (BallToken).
 */
export function buildStrip(
  winnerRarity: Rarity,
  pool: Rarity[],
  length: number,
  winIndex: number,
): Rarity[] {
  if (!Number.isInteger(length) || length <= 0) {
    throw new RangeError('buildStrip: length must be a positive integer');
  }
  if (!Number.isInteger(winIndex) || winIndex < 0 || winIndex >= length) {
    throw new RangeError('buildStrip: winIndex must be within [0, length)');
  }
  const safePool = pool.length > 0 ? pool : [winnerRarity];
  const strip = Array.from(
    { length },
    (_, i) => safePool[(i * 3 + 1) % safePool.length],
  );
  strip[winIndex] = winnerRarity;
  return strip;
}
