// src/app/slots/[slug]/SlotControls.tsx
'use client';

import { Sparkles, Info, Volume2, VolumeX } from 'lucide-react';
import { rm } from '@/lib/format';

export function SlotControls({
  cost,
  spinning,
  disabled,
  label,
  muted,
  onSpin,
  onToggleMute,
  onOpenOdds,
}: {
  cost: number;
  spinning: boolean;
  disabled: boolean;
  label: string;
  muted: boolean;
  onSpin: () => void;
  onToggleMute: () => void;
  onOpenOdds: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenOdds}
          className="inline-flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 text-[12px] font-semibold uppercase tracking-wide text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Info className="h-4 w-4" aria-hidden /> Odds
        </button>

        <button
          type="button"
          onClick={onSpin}
          disabled={disabled}
          className="inline-flex h-14 min-w-[200px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-8 text-base font-bold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="h-5 w-5" aria-hidden />
          {spinning ? 'Spinning…' : label}
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {muted ? (
            <VolumeX className="h-5 w-5" aria-hidden />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>
      <p className="text-[12px] text-white/50">
        Cost <span className="font-semibold text-white/80">{rm(cost)}</span> /
        spin
      </p>
    </div>
  );
}
