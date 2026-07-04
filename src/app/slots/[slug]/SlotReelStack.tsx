'use client';

import { useCallback, useEffect, useRef } from 'react';
import { VaultReelColumn } from './VaultReelColumn';
import { PaylineRow } from './PaylineRow';

export type ColumnWinner = {
  dex: number | null;
  image?: string;
  name?: string;
  rarityRgb: string; // rarity color, applied only after settle
};

/**
 * N vertical reel columns sharing one horizontal payline. Columns stop staggered
 * L→R (the rAF engine in VaultReelColumn owns per-column timing). `winners ===
 * null` = idle. `onAllSettled` fires once, after the LAST (slowest) column
 * settles — the win-after-stop guarantee (spec §4 bug #1). Remount columns via
 * `spinKey`.
 */
export function SlotReelStack({
  count,
  spinKey,
  winners,
  reduced,
  cellSize,
  pulse = false,
  onAllSettled,
  onWinnerRect,
  hideWinners,
}: {
  count: number;
  spinKey: string | number;
  winners: ColumnWinner[] | null;
  reduced: boolean;
  cellSize?: number;
  pulse?: boolean;
  onAllSettled?: () => void;
  onWinnerRect?: (colIndex: number, rect: DOMRect) => void;
  hideWinners?: boolean;
}) {
  const settledRef = useRef(0);
  // Latest onAllSettled in a ref so handleColSettled stays stable across parent
  // re-renders — otherwise an unmemoized parent callback would churn the column
  // props (harmless in Phase B at count=1, but compounds for Phase D count>1).
  const onAllSettledRef = useRef(onAllSettled);
  useEffect(() => {
    onAllSettledRef.current = onAllSettled;
  }, [onAllSettled]);
  useEffect(() => {
    settledRef.current = 0;
  }, [spinKey]);

  const handleColSettled = useCallback(() => {
    settledRef.current += 1;
    if (settledRef.current >= count) onAllSettledRef.current?.();
  }, [count]);

  return (
    <div className="relative flex items-stretch justify-center gap-3 sm:gap-5">
      <PaylineRow reduced={reduced} pulse={pulse} />
      {Array.from({ length: count }, (_, i) => {
        const w = winners ? winners[i] : null;
        return (
          <VaultReelColumn
            key={`${spinKey}-${i}`}
            winnerDex={w ? w.dex : null}
            winnerImage={w?.image}
            winnerName={w?.name}
            // Idle (winners === null) → rarityRgb is irrelevant; the column shows
            // a looping decoy strip and never glows or settles.
            rarityRgb={w ? w.rarityRgb : '163, 163, 163'}
            reduced={reduced}
            colIndex={i}
            count={count}
            cellSize={cellSize}
            // Only spinning columns report settle — idle columns get no callback
            // so the settled counter can never advance during the idle state.
            onSettled={winners ? handleColSettled : undefined}
            onWinnerRect={
              onWinnerRect ? (rect) => onWinnerRect(i, rect) : undefined
            }
            hideWinner={hideWinners}
          />
        );
      })}
    </div>
  );
}
