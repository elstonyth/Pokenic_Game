// src/app/slots/[slug]/VaultReelColumn.tsx
'use client';

// rAF-driven reel column: spinOffset() physics + per-frame 3D barrel curvature
// written imperatively to DOM refs (no React state per frame — 60fps budget).
// Replaces the CSS-transition SlotReelColumn; same settle contract.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDexStrip,
  ITEM_H,
  STRIP_LEN,
  WIN_INDEX,
  reelTargetY,
} from '@/lib/reel';
import {
  spinOffset,
  columnDurationMs,
  cellCurve,
  blurStretch,
  VISIBLE_CELLS,
} from '@/lib/vault-reel';
import { spriteGif } from '@/lib/mock/pokedex';
import { CardTile } from './CardTile';

const EAGER_RADIUS = 3;

export function VaultReelColumn({
  winnerDex,
  winnerImage,
  winnerName,
  rarityRgb,
  reduced,
  colIndex,
  count,
  cellSize = 96,
  onSettled,
  onWinnerRect,
  hideWinner = false,
}: {
  winnerDex: number | null;
  winnerImage?: string;
  winnerName?: string;
  rarityRgb: string;
  reduced: boolean;
  colIndex: number;
  count: number;
  cellSize?: number;
  onSettled?: () => void;
  onWinnerRect?: (rect: DOMRect) => void;
  hideWinner?: boolean;
}) {
  const windowRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [done, setDone] = useState(false);
  const settled = useRef(false);
  const onSettledRef = useRef(onSettled);
  const onWinnerRectRef = useRef(onWinnerRect);
  useEffect(() => {
    onSettledRef.current = onSettled;
    onWinnerRectRef.current = onWinnerRect;
  });

  // Report the landed tile's screen rect — the origin of the slab morph.
  const reportWinnerRect = () => {
    const rect = cellRefs.current[WIN_INDEX]?.getBoundingClientRect();
    if (rect) onWinnerRectRef.current?.(rect);
  };

  const isWin = winnerDex !== null || winnerImage !== undefined;
  const strip = useMemo(
    () => buildDexStrip(winnerDex ?? 1, STRIP_LEN, WIN_INDEX),
    [winnerDex],
  );

  // Warm the winner image cache during the spin (verbatim from old column).
  useEffect(() => {
    if (!isWin) return;
    const img = new Image();
    img.src = winnerImage ?? spriteGif(winnerDex ?? 1);
  }, [isWin, winnerImage, winnerDex]);

  useEffect(() => {
    settled.current = false;
    const winEl = windowRef.current;
    const stripEl = stripRef.current;
    if (!winEl || !stripEl) return;
    const winH = winEl.clientHeight || ITEM_H * VISIBLE_CELLS;
    const radius = winH / 2;
    const target = Math.round(reelTargetY(WIN_INDEX, ITEM_H, winH));

    const paint = (offset: number, velocity: number) => {
      stripEl.style.transform = `translate3d(0, ${-offset}px, 0)`;
      const stretch = blurStretch(velocity);
      // Only style cells near the window (offset → visible index range).
      const first = Math.max(0, Math.floor(offset / ITEM_H) - 1);
      const last = Math.min(STRIP_LEN - 1, first + VISIBLE_CELLS + 2);
      for (let i = 0; i < STRIP_LEN; i++) {
        const el = cellRefs.current[i];
        if (!el) continue;
        if (i < first || i > last) {
          el.style.transform = '';
          el.style.opacity = '0';
          continue;
        }
        const cellCenter = i * ITEM_H + ITEM_H / 2 - offset;
        const dist = cellCenter - winH / 2;
        const c = cellCurve(dist, radius);
        el.style.transform =
          `perspective(700px) translateZ(${c.translateZPx}px) ` +
          `rotateX(${c.rotateXDeg}deg) scale(${c.scale}) scaleY(${stretch.scaleY})`;
        el.style.opacity = String(c.brightness * stretch.opacity);
      }
    };

    // Idle: rest centered, static curve, no settle.
    if (!isWin) {
      paint(target, 0);
      return;
    }
    // Reduced motion: jump + settle next tick (same contract as before).
    if (reduced) {
      paint(target, 0);
      const id = setTimeout(() => {
        if (!settled.current) {
          settled.current = true;
          setDone(true);
          reportWinnerRect();
          onSettledRef.current?.();
        }
      }, 0);
      return () => clearTimeout(id);
    }
    // Real spin: rAF timeline.
    const dur = columnDurationMs(colIndex, count);
    const start = performance.now();
    let prevOffset = 0;
    let prevT = start;
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      const offset = spinOffset(t, target, colIndex, count, ITEM_H);
      const dt = Math.max(1, now - prevT);
      paint(offset, (offset - prevOffset) / dt);
      prevOffset = offset;
      prevT = now;
      if (t >= dur) {
        paint(target, 0);
        if (!settled.current) {
          settled.current = true;
          setDone(true);
          reportWinnerRect();
          onSettledRef.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isWin, reduced, colIndex, count]);

  return (
    <div
      ref={windowRef}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/80 shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]"
      style={{
        height: `clamp(200px, calc(100dvh - 320px), ${ITEM_H * VISIBLE_CELLS}px)`,
        width: `${cellSize + 24}px`,
      }}
      aria-hidden
    >
      {/* glass highlight sweep — static gradient, cheap */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-2xl bg-gradient-to-b from-white/10 via-transparent to-black/40"
      />
      <div
        ref={stripRef}
        className="flex flex-col items-center will-change-transform"
      >
        {strip.map((dex, i) => {
          const isWinnerCell = i === WIN_INDEX;
          const landed = isWinnerCell && done;
          return (
            <div
              key={i}
              ref={(el) => {
                cellRefs.current[i] = el;
              }}
              className="flex shrink-0 items-center justify-center will-change-transform"
              style={{
                height: `${ITEM_H}px`,
                // The landed tile hides while its morph clone is on stage —
                // otherwise the player would see the card twice.
                visibility: hideWinner && isWinnerCell ? 'hidden' : undefined,
              }}
            >
              <CardTile
                dex={dex}
                name={isWinnerCell ? (winnerName ?? '') : ''}
                size={cellSize}
                landed={landed}
                rarityRgb={landed ? rarityRgb : null}
                reduced={reduced}
                eager={Math.abs(i - WIN_INDEX) <= EAGER_RADIUS}
                imageSrc={isWinnerCell ? winnerImage : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
