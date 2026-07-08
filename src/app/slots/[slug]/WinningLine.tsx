'use client';

// The winning line (spec §4): one neutral vertical marker down the center of
// the stacked strips — a thin bright rule with small notches top and bottom.
// Deliberately NOT amber (amber reads as chase-gold prize signal in this app);
// the winning CELL carries the rarity color, not the line. Purely decorative.
import { cn } from '@/lib/utils';

export function WinningLine({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-y-0 left-1/2 z-20 -translate-x-1/2',
        className,
      )}
    >
      {/* the rule */}
      <div
        className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(255,255,255,0.65) 12%, rgba(255,255,255,0.65) 88%, transparent)',
          boxShadow: '0 0 6px rgba(255,255,255,0.35)',
        }}
      />
      {/* notches */}
      <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-white/70" />
      <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-white/70" />
    </div>
  );
}
