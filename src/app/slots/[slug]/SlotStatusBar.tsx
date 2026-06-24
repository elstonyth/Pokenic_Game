// src/app/slots/[slug]/SlotStatusBar.tsx
'use client';

import { cn } from '@/lib/utils';
import { rm } from '@/lib/format';
import type { RecentPull } from '@/lib/data/packs';

export function SlotStatusBar({
  balance,
  recent,
  reduced,
}: {
  balance: number | null;
  recent: RecentPull[];
  reduced: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-5">
        {balance !== null && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Credit
            </p>
            <p className="font-heading text-lg font-bold tabular-nums text-white">
              {rm(balance)}
            </p>
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
            Wins
          </p>
          <p className="font-heading text-lg font-bold tabular-nums text-white">
            {recent.length}
          </p>
        </div>
      </div>
      {/* RECENT WINS marquee — keyframe `sp-scroll-x` lives in globals.css;
          frozen under reduced motion. */}
      {recent.length > 0 && (
        <div className="relative max-w-full overflow-hidden sm:max-w-[55%]">
          <div
            className={cn(
              'flex w-max gap-4',
              !reduced && 'animate-[sp-scroll-x_30s_linear_infinite]',
            )}
          >
            {[...recent, ...recent].map((p, i) => (
              <span
                key={`${p.id}-${i}`}
                className="flex shrink-0 items-center gap-1.5 text-[11px] text-white/50"
              >
                <span className="font-medium text-white/75">{p.name}</span>
                <span className="tabular-nums text-white/40">{p.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
