// src/app/slots/[slug]/SlotControls.tsx
'use client';

import type { ReactNode } from 'react';
import { Sparkles, Info, Volume2, VolumeX } from 'lucide-react';

export function SlotControls({
  costLine,
  spinning,
  disabled,
  label,
  muted,
  onSpin,
  onToggleMute,
  onOpenOdds,
}: {
  costLine: ReactNode;
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
      <div className="flex w-full max-w-[340px] items-center gap-3">
        <button
          type="button"
          onClick={onOpenOdds}
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Odds"
        >
          <Info className="h-5 w-5" aria-hidden />
        </button>

        <button
          type="button"
          onClick={onSpin}
          disabled={disabled}
          className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-base font-bold text-neutral-950 shadow-[0_8px_30px_rgba(251,191,36,0.25)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles className="h-5 w-5" aria-hidden />
          {spinning ? 'Spinning…' : label}
        </button>

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          aria-pressed={muted}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {muted ? (
            <VolumeX className="h-5 w-5" aria-hidden />
          ) : (
            <Volume2 className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>

      <div className="text-[12px] text-white/50">{costLine}</div>
    </div>
  );
}
