import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import Reveal from '@/components/Reveal';
import { groupPacksByTier } from '@/lib/home-shelf';
import { TIER_COLOR } from '@/lib/price-tier';
import type { Pack, PackCard } from '@/lib/packs-data';

/**
 * Board 02 — RIP A PACK. Horizontal snap racks grouped by price tier, highest
 * first. Every tile and ghost tile → /slots (routing rule); sold-out tiles are
 * inert. Racks stagger-reveal on scroll.
 */
export default function TierShelf({
  packs,
  chaseByPack,
}: {
  packs: Pack[];
  chaseByPack: Map<string, PackCard | null>;
}) {
  const racks = groupPacksByTier(packs);

  return (
    <section aria-labelledby="shelf-heading" className="px-fluid mt-4 w-full">
      <div className="flex items-baseline justify-between">
        <h1 id="shelf-heading" className="font-heading text-3xl text-white">
          RIP A PACK
        </h1>
        <Link
          href="/slots"
          className="flex min-h-11 items-center gap-1 text-[13px] font-semibold text-neutral-400 transition-colors hover:text-white"
        >
          All packs
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {racks.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-white/10 bg-neutral-900 px-4 py-10 text-center text-[13px] text-neutral-400">
          No packs available right now — check back soon.
        </p>
      ) : (
        racks.map((rack, i) => (
          <Reveal key={rack.tier} delay={i * 80} className="mt-5">
            <div
              className="flex items-center gap-2 border-b pb-2"
              style={{ borderColor: `rgba(${TIER_COLOR[rack.tier]}, 0.4)` }}
            >
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{
                  color: `rgb(${TIER_COLOR[rack.tier]})`,
                  backgroundColor: `rgba(${TIER_COLOR[rack.tier]}, 0.12)`,
                }}
              >
                {rack.tier}
              </span>
            </div>
            <div className="-mx-1 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {rack.packs.map((pack) => (
                <ShelfTile
                  key={pack.id}
                  pack={pack}
                  tierRgb={TIER_COLOR[rack.tier]}
                  chase={chaseByPack.get(pack.id) ?? null}
                />
              ))}
              <Link
                href="/slots"
                className="flex w-32 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/5 text-[13px] font-semibold text-neutral-300 transition-colors hover:bg-white/10"
              >
                See all
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </Reveal>
        ))
      )}
    </section>
  );
}

/** One rack tile. In-stock → /slots; sold out → inert. */
function ShelfTile({
  pack,
  tierRgb,
  chase,
}: {
  pack: Pack;
  tierRgb: string;
  chase: PackCard | null;
}) {
  const soldOut = pack.inStock === false;

  const body = (
    <>
      <div className="relative flex h-32 items-center justify-center">
        <Image
          src={pack.image}
          alt={pack.name}
          width={128}
          height={128}
          // Pack art is operator-entered and can live on any host (not in
          // next.config remotePatterns) — bypass the optimizer like the detail
          // hero does, else /_next/image 400s and the thumbnail breaks.
          unoptimized
          className="h-full w-auto object-contain"
        />
        {soldOut && (
          <span className="absolute right-0 top-0 rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-semibold text-neutral-400">
            Sold out
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-[13px] font-semibold text-white">
        {pack.name}
      </p>
      <span className="font-heading mt-0.5 whitespace-nowrap text-lg text-white">
        {pack.price}
      </span>
      {chase && (
        <p className="mt-1 truncate text-[11px] uppercase tracking-wide text-neutral-400">
          Top chase{' '}
          <span className="text-chase font-semibold">{chase.value}</span>
        </p>
      )}
    </>
  );

  const tileClass =
    'flex w-40 shrink-0 snap-start flex-col rounded-2xl border bg-neutral-900 p-3';
  const tileStyle = { borderColor: `rgba(${tierRgb}, 0.4)` };

  if (soldOut) {
    return (
      <div className={`${tileClass} opacity-50`} style={tileStyle}>
        {body}
      </div>
    );
  }
  return (
    <Link
      href="/slots"
      className={`${tileClass} transition-[transform,border-color] hover:border-white/30 active:scale-[0.98] motion-reduce:transition-colors motion-reduce:active:scale-100`}
      style={tileStyle}
    >
      {body}
    </Link>
  );
}
