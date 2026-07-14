import Link from 'next/link';
import { rarityRgb } from '@/lib/rarity';
import type { RecentPull } from '@/lib/data/packs';

/**
 * The Drop Board seam: a slim data marquee streaming real pulls between the
 * hero and the shelf. CSS-only loop (track duplicated, sp-scroll-x), pauses on
 * hover/press, static swipeable row under reduced motion. Whole band → /slots.
 */
export default function PullsMarquee({ pulls }: { pulls: RecentPull[] }) {
  if (pulls.length === 0) return null;

  const entries = pulls.slice(0, 12);
  const track = (ariaHidden: boolean) => (
    <div
      aria-hidden={ariaHidden || undefined}
      className="flex shrink-0 items-center gap-8 pr-8"
    >
      {entries.map((pull) => (
        <span
          key={`${ariaHidden ? 'dup-' : ''}${pull.id}`}
          className="flex items-center gap-2 whitespace-nowrap"
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: `rgb(${rarityRgb(pull.rarity)})` }}
            aria-hidden
          />
          <span className="text-[13px] text-neutral-400">
            {pull.who} pulled
          </span>
          <span className="font-heading text-sm text-white">{pull.value}</span>
          <span className="text-[11px] text-neutral-500">{pull.agoLabel}</span>
        </span>
      ))}
    </div>
  );

  return (
    <Link
      href="/slots"
      aria-label="Live pulls — browse all packs"
      className="block w-full border-y border-white/10 bg-neutral-900 py-2.5 transition-colors hover:bg-neutral-800"
    >
      {/* Animated loop; reduced motion → static swipeable row */}
      <div className="overflow-hidden motion-reduce:overflow-x-auto">
        <div className="px-fluid flex w-max animate-[sp-scroll-x_30s_linear_infinite] hover:[animation-play-state:paused] active:[animation-play-state:paused] motion-reduce:animate-none">
          {track(false)}
          <span className="motion-reduce:hidden">{track(true)}</span>
        </div>
      </div>
    </Link>
  );
}
