'use client';

import { useCallback, useEffect, useRef } from 'react';
import { STAGGER_MS } from '@/lib/reel';
import type { Tier } from '@/lib/price-tier';
import { SlotReelColumn } from './SlotReelColumn';
import { PaylineRow } from './PaylineRow';

export type ColumnWinner = {
  dex: number | null;
  image?: string;
  name?: string;
  tier: Tier;
};

/**
 * N vertical reel columns sharing one horizontal payline. Columns stop staggered
 * L→R (column i stops at baseDurationMs + i*STAGGER_MS). `winners === null` =
 * idle. `onAllSettled` fires once, after the LAST (slowest) column settles — the
 * win-after-stop guarantee (spec §4 bug #1). Remount columns via `spinKey`.
 * Phase B drives count=1; the structure is already N-ready for Phase D.
 */
export function SlotReelStack({
  count,
  spinKey,
  winners,
  reduced,
  baseDurationMs,
  cellSize,
  pulse = false,
  onAllSettled,
}: {
  count: number;
  spinKey: string | number;
  winners: ColumnWinner[] | null;
  reduced: boolean;
  baseDurationMs: number;
  cellSize?: number;
  pulse?: boolean;
  onAllSettled?: () => void;
}) {
  const settledRef = useRef(0);
  useEffect(() => {
    settledRef.current = 0;
  }, [spinKey]);

  const handleColSettled = useCallback(() => {
    settledRef.current += 1;
    if (settledRef.current >= count) onAllSettled?.();
  }, [count, onAllSettled]);

  return (
    <div className="relative flex items-stretch justify-center gap-3 sm:gap-5">
      <PaylineRow reduced={reduced} pulse={pulse} />
      {Array.from({ length: count }, (_, i) => {
        const w = winners ? winners[i] : null;
        return (
          <SlotReelColumn
            key={`${spinKey}-${i}`}
            winnerDex={w ? w.dex : null}
            winnerImage={w?.image}
            winnerName={w?.name}
            tier={w ? w.tier : 'common'}
            reduced={reduced}
            durationMs={baseDurationMs + i * STAGGER_MS}
            cellSize={cellSize}
            onSettled={handleColSettled}
          />
        );
      })}
    </div>
  );
}
