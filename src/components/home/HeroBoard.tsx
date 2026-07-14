import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pillVariants } from '@/components/ui/pill';
import HeroSlab from '@/components/home/HeroSlab';
import { type Pack, type PackCard } from '@/lib/packs-data';

/**
 * Board 01 — THE SHOP IS OPEN. The glowing Polycards shop diorama floating on
 * the ink page (its warm interior light replaces the old per-rarity glow).
 * Phone: stacked near-full-viewport; desktop: type left, shop right. The top
 * chase still headlines the type block when the pool has one.
 * CTA → /slots (the routing rule: home never deep-links a product).
 */
export default function HeroBoard({
  pack,
  chase,
}: {
  pack: Pack;
  chase: PackCard | null;
}) {
  return (
    // Phone: kicker → slab → value/name → CTA, all inside the first viewport
    // (media height is capped so the pill stays in thumb reach). Desktop: the
    // kicker + type block form the left column, the slab the right.
    <section
      aria-labelledby="hero-heading"
      // Phone height subtracts header (64) + fixed TabBar (64) so the CTA
      // clears the bar even on short phones; desktop has no TabBar.
      className="px-fluid flex min-h-[calc(100svh-128px)] w-full flex-col items-center justify-center gap-5 py-8 text-center lg:grid lg:min-h-[calc(100svh-64px)] lg:grid-cols-[1fr_auto] lg:content-center lg:items-center lg:gap-x-12 lg:py-16 lg:text-left"
    >
      <p
        id="hero-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-400 lg:col-start-1 lg:row-start-1 lg:self-end"
      >
        The shop is open
      </p>

      {/* The glowing shop diorama — its own warm light is the spotlight
          (transparent cutout, so it floats directly on the ink page). */}
      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <HeroSlab>
          {/* No backing glow: a box-shadow reads as a rectangle behind the
              cutout — the shop's own interior light does the lighting. */}
          <div>
            <Image
              src="/images/polycards/shop-night.webp"
              alt="The Polycards shop, glowing at night"
              width={2200}
              height={1458}
              // Static webp — let next/image serve responsive sizes (the
              // animated pack heroes need `unoptimized`; this one doesn't,
              // and the full 2200px master is too heavy for phone LCP).
              sizes="(min-width: 1024px) 34rem, 88vw"
              // The near-full-viewport hero is the page's LCP — load eagerly.
              priority
              className="h-auto max-h-[44svh] w-auto max-w-[min(88vw,24rem)] object-contain lg:max-h-[62svh] lg:max-w-[34rem]"
            />
          </div>
        </HeroSlab>
      </div>

      {/* Type block — the top chase still gets the headline when one exists. */}
      <div className="flex flex-col items-center lg:col-start-1 lg:row-start-2 lg:items-start lg:self-start">
        {chase ? (
          <>
            <p className="font-heading text-chase text-5xl leading-none lg:mt-3 lg:text-7xl">
              {chase.value}
            </p>
            <p className="mt-2 max-w-xs truncate text-sm text-neutral-400 lg:max-w-md">
              Top chase: {chase.name} · {pack.name}
            </p>
          </>
        ) : (
          <>
            <p className="font-heading text-5xl leading-none text-white lg:mt-3 lg:text-7xl">
              Rip real graded cards
            </p>
            <p className="mt-2 max-w-xs text-sm text-neutral-400 lg:max-w-md">
              Every pack holds a real, professionally graded slab.
            </p>
          </>
        )}
        <Link
          href="/slots"
          className={cn(
            pillVariants({ variant: 'primary', size: 'lg' }),
            'mt-6',
          )}
        >
          RIP A PACK
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
