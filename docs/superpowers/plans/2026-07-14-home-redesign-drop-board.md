# Home Redesign "The Drop Board" — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/` as a six-board, phone-first editorial scroll story ("The Drop Board") where every product tap routes to plain `/slots`.

**Architecture:** `src/app/page.tsx` stays a server component that fetches all data (`getPackCategories`, `getRecentPulls`, `getPackDetail` chase lookups, `getLeaderboard('weekly')`) and composes six board components under `src/components/home/`. Motion reuses the shipped `useInView`/`usePrefersReducedMotion`/`Reveal`/`staggerDelay` foundation plus two tiny client components (hero slab motion, marquee is CSS-only). No new dependencies.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, vitest (util test only), Playwright QA scripts.

**Spec:** `docs/superpowers/specs/2026-07-14-home-redesign-design.md` (approved 2026-07-14).

## Global Constraints

- **Routing rule:** every product tap → plain `/slots` — hero CTA, marquee band, shelf tiles, ghost tiles, JUST PULLED cards, final CTA. Sold-out tiles inert. Non-product links: `All packs →` `/slots`, `How it works →` `/how-it-works`, `See ranks →` `/leaderboard`.
- **Zero new dependencies.** CSS transforms + rAF only; no motion libraries.
- **Reduced motion is a first-class path** via `usePrefersReducedMotion()` / Tailwind `motion-reduce:` — every effect has a static equivalent; content never gated on animation.
- **Signal colors only** (DESIGN.md): chrome monochrome; chase-gold = prize values (`text-chase`), buyback green = money-in (`text-buyback-fg`), tier hues via `TIER_COLOR`, rarity hues via `rarityRgb`. No gradients, no drop shadows, hairline borders (`border-white/10`), containers ≤16px radius (`rounded-2xl`), tap targets ≥44px.
- **Type/copy:** headings `font-heading` (Nekst) ALL-CAPS per the copy deck below — copy strings are verbatim, do not invent.
- **Tiers are the shipped six** (`common…immortal` from `src/lib/price-tier.ts`), NOT the spec's illustrative "GOLD TIER" — rack labels use real tier names.
- **Tests:** TDD only the genuine logic (`groupPacksByTier`); boards are presentational → Playwright visual QA per `.claude/rules/common/testing.md`. No brittle markup unit tests.
- **States:** every board handles empty + error-silent. The spec's *skeleton* variants are N/A in Phase 1 — the page is fully SSR'd (`force-dynamic`), so there is no client loading window; the only client-fetch surface (live pulls) keeps its existing behavior. Do not invent client skeletons.
- **Verify on the standalone server** (`npm run build` + `pwsh scripts/serve-standalone.ps1 -Port 4000`), never `next dev`.
- TypeScript strict (no `any`), named exports, PascalCase components, Tailwind only (inline `style` allowed solely for computed rgba glows, matching existing precedent).

## Copy deck (verbatim)

| Slot | Copy |
| --- | --- |
| Hero kicker | `TOP CHASE IN THE BUILDING` |
| Hero/Final CTA pill | `RIP A PACK` |
| Shelf headline | `RIP A PACK` · link `All packs` |
| Board 03 heading | `HOW IT RIPS` · link `How it works` |
| Step 01 | `BUY CREDITS` — `Top up in seconds. RM in, credits out.` |
| Step 02 | `RIP THE REEL` — `Spin the pack. Watch the reveal land.` |
| Step 03 | `IT'S REAL` — `Every pull is a real graded slab — vault it, ship it, or sell back up to 90%.` |
| Board 04 heading | `JUST PULLED` · chip `LIVE` |
| Board 05 heading | `THE FLOOR PAYS OUT` |
| Medals subhead | `TOP RIPPERS THIS WEEK` · link `See ranks` |
| VIP card | `100 VIP LEVELS. TWO-TIER REFERRALS.` — `Every rip levels you up — and your crew's rips pay you twice.` · link `Learn more` |
| Board 06 lockup | `YOUR CHASE` / `IS WAITING` · reassurance `Real graded slabs · Up to 90% buyback` |
| Shelf empty | `No packs available right now — check back soon.` |
| Pulls empty | `No pulls yet — be the first to open a pack.` |

## Interfaces already shipped (consume, don't re-create)

```ts
// src/lib/packs-data.ts
type Pack = { id: string; name: string; price: string; image: string;
  boost?: boolean; buybackPercent?: number; inStock?: boolean };
type PackCard = { id: string; name: string; image: string; slabImage: string | null;
  value: string; rarity: Rarity; /* … */ };
type Rarity = 'Immortal'|'Legendary'|'Mythical'|'Rare'|'Uncommon'|'Common';
priceNumber(price: string): number
// src/lib/data/packs.ts
getPackCategories(): Promise<PackCategory[]>   // PackCategory has .packs: Pack[]
getPackDetail(slug: string): Promise<PackDetail | null>  // .topHits: PackCard[]
getRecentPulls(): Promise<RecentPull[]>
interface RecentPull { id; handle; name; image; slabImage: string|null;
  value: string; rarity: Rarity; packName; packIcon; who; agoLabel: string }
// src/lib/data/leaderboard.ts
getLeaderboard(period?: 'weekly'|'alltime'): Promise<LeaderboardEntry[]> // [] on failure
interface LeaderboardEntry { rank: number; name: string; volume: string /* "RM 8,173.26" */; /* … */ }
// src/lib/price-tier.ts
type Tier = 'common'|'uncommon'|'rare'|'mythical'|'legendary'|'immortal';
priceTier(value: number): Tier
TIER_COLOR: Record<Tier, string>   // "r, g, b"
TIER_ORDER: readonly Tier[]        // low → high
// src/lib/rarity.ts
rarityRgb(rarity: string): string  // "r, g, b", tolerant
// src/lib/use-reveal.ts
useInView<T extends HTMLElement>(): [ref, shown]
usePrefersReducedMotion(): boolean
staggerDelay(shown, reduced, index, stepMs): { transitionDelay: string }
// src/components/Reveal.tsx  — <Reveal delay={ms} y={px} as="section">
// src/components/ui/pill.tsx — pillVariants({ variant:'primary'|'secondary'|'ghost', size:'sm'|'md'|'lg' })
// src/components/SlabImage.tsx — <SlabImage src slabSrc alt sizes className>
// src/components/card-pedestal.ts — PEDESTAL_BG, PEDESTAL_FRAME_HOVER
// src/app/globals.css — @keyframes sp-scroll-x (translate3d(0,0,0) → (-50%,0,0)), fadeIn
```

---

### Task 0: Worktree + carried commits

**Files:** none (git only)

- [ ] **Step 1: Create isolated worktree branched from origin/master** (per repo convention — consent pre-granted; run `npm install` after):

```bash
git fetch origin master
git worktree add .worktrees/home-drop-board -b feat/home-drop-board origin/master
cd .worktrees/home-drop-board
npm install
```

- [ ] **Step 2: Cherry-pick the spec + gitignore commits** (authored on `reel-idle-randomization` by mistake — they belong with this PR):

```bash
git cherry-pick 79af438f 2df9a343
```

Expected: both apply clean (new file + 2-line .gitignore hunk).

- [ ] **Step 3: Copy local env into the worktree** (memory: fresh worktrees need it):

```bash
cp ../../.env.local .env.local 2>/dev/null; cp ../../.env.e2e .env.e2e 2>/dev/null; true
```

---

### Task 1: `groupPacksByTier` util (TDD — the one genuine-logic unit)

**Files:**
- Create: `src/lib/home-shelf.ts`
- Test: `src/lib/__tests__/home-shelf.test.ts`

**Interfaces:**
- Consumes: `Pack`, `priceNumber` from `@/lib/packs-data`; `priceTier`, `TIER_ORDER`, type `Tier` from `@/lib/price-tier`.
- Produces: `export interface TierRack { tier: Tier; packs: Pack[] }`; `export function groupPacksByTier(packs: Pack[]): TierRack[]` — racks ordered high→low tier, packs keep input order, empty tiers omitted.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/home-shelf.test.ts
import { describe, expect, test } from 'vitest';
import { groupPacksByTier } from '@/lib/home-shelf';
import type { Pack } from '@/lib/packs-data';

const pack = (id: string, price: string): Pack => ({
  id,
  name: id,
  price,
  image: `/images/${id}.png`,
});

describe('groupPacksByTier', () => {
  test('groups by price tier, racks ordered high tier first', () => {
    const racks = groupPacksByTier([
      pack('cheap', 'RM 10'), // common (<25)
      pack('mid', 'RM 150'), // rare (100–499)
      pack('big', 'RM 2,500'), // legendary (2000–9999)
    ]);
    expect(racks.map((r) => r.tier)).toEqual(['legendary', 'rare', 'common']);
    expect(racks[0].packs.map((p) => p.id)).toEqual(['big']);
  });

  test('keeps input order within a rack', () => {
    const racks = groupPacksByTier([
      pack('a', 'RM 120'),
      pack('b', 'RM 480'),
    ]);
    expect(racks).toHaveLength(1);
    expect(racks[0].packs.map((p) => p.id)).toEqual(['a', 'b']);
  });

  test('omits empty tiers and handles empty input', () => {
    expect(groupPacksByTier([])).toEqual([]);
  });

  test('unparseable price falls into common (priceTier fallback)', () => {
    const racks = groupPacksByTier([pack('weird', 'FREE')]);
    expect(racks).toHaveLength(1);
    expect(racks[0].tier).toBe('common');
    expect(racks[0].packs.map((p) => p.id)).toEqual(['weird']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/__tests__/home-shelf.test.ts`
Expected: FAIL — `Cannot find module '@/lib/home-shelf'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/home-shelf.ts
import { priceNumber, type Pack } from '@/lib/packs-data';
import { priceTier, TIER_ORDER, type Tier } from '@/lib/price-tier';

export interface TierRack {
  tier: Tier;
  packs: Pack[];
}

/**
 * Group catalog packs into shelf racks by price tier, highest tier first
 * (drop-board order: the expensive rack leads). Pack order within a rack is
 * the catalog's own order. Empty tiers are omitted.
 */
export function groupPacksByTier(packs: Pack[]): TierRack[] {
  const byTier = new Map<Tier, Pack[]>();
  for (const pack of packs) {
    const tier = priceTier(priceNumber(pack.price));
    const rack = byTier.get(tier);
    if (rack) rack.push(pack);
    else byTier.set(tier, [pack]);
  }
  return [...TIER_ORDER]
    .reverse()
    .filter((tier) => byTier.has(tier))
    .map((tier) => ({ tier, packs: byTier.get(tier)! }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/__tests__/home-shelf.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/home-shelf.ts src/lib/__tests__/home-shelf.test.ts
git commit -m "feat(home): groupPacksByTier — tier-rack grouping for the shelf"
```

---

### Task 2: PullsMarquee (the seam) + slab-float keyframe

**Files:**
- Create: `src/components/home/PullsMarquee.tsx`
- Modify: `src/app/globals.css` (one new keyframe, after `clawFloat`)

**Interfaces:**
- Consumes: `RecentPull` from `@/lib/data/packs`; `rarityRgb` from `@/lib/rarity`; existing `sp-scroll-x` keyframe.
- Produces: `export default function PullsMarquee({ pulls }: { pulls: RecentPull[] })` — server component; renders `null` when `pulls.length === 0`.

- [ ] **Step 1: Add the hero slab float keyframe to globals.css** (used by Task 3; ±8px, gentler than `clawFloat`):

```css
/* Hero spotlight slab — idle float (±8px; Drop Board board 01) */
@keyframes slabFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
```

- [ ] **Step 2: Create the marquee component**

```tsx
// src/components/home/PullsMarquee.tsx
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
          <span className="text-[13px] text-neutral-400">{pull.who} pulled</span>
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
        <div className="flex w-max animate-[sp-scroll-x_30s_linear_infinite] px-fluid hover:[animation-play-state:paused] active:[animation-play-state:paused] motion-reduce:animate-none">
          {track(false)}
          <span className="motion-reduce:hidden">{track(true)}</span>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Typecheck** — Run: `npm run typecheck`. Expected: clean (the PostToolUse hook also fires per edit).

- [ ] **Step 4: Commit**

```bash
git add src/components/home/PullsMarquee.tsx src/app/globals.css
git commit -m "feat(home): PullsMarquee — live-pull data marquee seam + slabFloat keyframe"
```

---

### Task 3: HeroSlab (client motion) + HeroBoard (board 01)

**Files:**
- Create: `src/components/home/HeroSlab.tsx` (client)
- Create: `src/components/home/HeroBoard.tsx` (server)

**Interfaces:**
- Consumes: `Pack`, `PackCard`, `priceNumber` from `@/lib/packs-data`; `priceTier`, `TIER_COLOR` from `@/lib/price-tier`; `rarityRgb` from `@/lib/rarity`; `SlabImage`; `pillVariants`; `usePrefersReducedMotion`; `slabFloat` keyframe (Task 2).
- Produces: `export default function HeroBoard({ pack, chase }: { pack: Pack; chase: PackCard | null })`; `export default function HeroSlab({ children }: { children: React.ReactNode })` — motion wrapper only, content-agnostic.

- [ ] **Step 1: Create the motion wrapper**

```tsx
// src/components/home/HeroSlab.tsx
'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reveal';

/**
 * Board 01 motion: idle float (CSS slabFloat) + a subtle scroll-linked
 * tilt/parallax as the hero scrolls out. rAF-throttled passive listener, CSS
 * transforms only. Reduced motion: perfectly still (no float, no tilt).
 */
export default function HeroSlab({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const node = ref.current;
    if (!node) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        // 0 at top → 1 after one viewport of scroll
        const progress = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
        node.style.transform = `translateY(${progress * 32}px) rotate3d(1, 0, 0, ${progress * 8}deg)`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      node.style.transform = '';
    };
  }, [reduced]);

  return (
    <div style={{ perspective: '900px' }}>
      <div ref={ref}>
        <div className="animate-[slabFloat_6s_ease-in-out_infinite] motion-reduce:animate-none">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the hero board**

```tsx
// src/components/home/HeroBoard.tsx
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pillVariants } from '@/components/ui/pill';
import { SlabImage } from '@/components/SlabImage';
import HeroSlab from '@/components/home/HeroSlab';
import { priceNumber, type Pack, type PackCard } from '@/lib/packs-data';
import { rarityRgb } from '@/lib/rarity';
import { priceTier, TIER_COLOR } from '@/lib/price-tier';

/**
 * Board 01 — TOP CHASE IN THE BUILDING. One slab lit by its own rarity in the
 * dark room. Phone: stacked near-full-viewport; desktop: type left, slab right.
 * CTA → /slots (the routing rule: home never deep-links a product).
 */
export default function HeroBoard({
  pack,
  chase,
}: {
  pack: Pack;
  chase: PackCard | null;
}) {
  // Glow hue: the chase card's rarity; pack-art fallback uses the price tier.
  const glow = chase
    ? rarityRgb(chase.rarity)
    : TIER_COLOR[priceTier(priceNumber(pack.price))];

  return (
    <section
      aria-labelledby="hero-heading"
      className="px-fluid flex min-h-[calc(100svh-64px)] w-full flex-col items-center justify-center gap-6 py-10 text-center lg:flex-row-reverse lg:justify-between lg:gap-12 lg:py-16 lg:text-left"
    >
      {/* The slab (or pack art fallback) on its spotlight */}
      <HeroSlab>
        <div
          className="rounded-xl"
          style={{ boxShadow: `0 0 80px 8px rgba(${glow}, 0.35)` }}
        >
          {chase ? (
            <SlabImage
              src={chase.image}
              slabSrc={chase.slabImage}
              alt={chase.name}
              sizes="(min-width: 1024px) 420px, 60vw"
              className="w-[min(60vw,15rem)] lg:w-[26rem]"
            />
          ) : (
            <Image
              src={pack.image}
              alt={pack.name}
              width={420}
              height={420}
              unoptimized
              className="h-auto w-[min(60vw,15rem)] object-contain lg:w-[26rem]"
            />
          )}
        </div>
      </HeroSlab>

      {/* Type block */}
      <div className="flex flex-col items-center lg:items-start">
        <p
          id="hero-heading"
          className="text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-400"
        >
          Top chase in the building
        </p>
        {chase ? (
          <>
            <p className="font-heading text-chase mt-3 text-5xl leading-none lg:text-7xl">
              {chase.value}
            </p>
            <p className="mt-2 max-w-xs truncate text-sm text-neutral-400 lg:max-w-md">
              {chase.name} · {pack.name}
            </p>
          </>
        ) : (
          <p className="font-heading mt-3 text-5xl leading-none text-white lg:text-7xl">
            {pack.name}
          </p>
        )}
        <Link
          href="/slots"
          className={cn(pillVariants({ variant: 'primary', size: 'lg' }), 'mt-7')}
        >
          RIP A PACK
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck** — Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/home/HeroSlab.tsx src/components/home/HeroBoard.tsx
git commit -m "feat(home): HeroBoard — spotlight-slab board 01 with float + scroll tilt"
```

---

### Task 4: TierShelf (board 02)

**Files:**
- Create: `src/components/home/TierShelf.tsx`

**Interfaces:**
- Consumes: `groupPacksByTier`, `TierRack` (Task 1); `TIER_COLOR` from `@/lib/price-tier`; `Pack`, `PackCard` from `@/lib/packs-data`; `Reveal`.
- Produces: `export default function TierShelf({ packs, chaseByPack }: { packs: Pack[]; chaseByPack: Map<string, PackCard | null> })`.

- [ ] **Step 1: Create the shelf**

```tsx
// src/components/home/TierShelf.tsx
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
          Top chase <span className="text-chase font-semibold">{chase.value}</span>
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
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/TierShelf.tsx
git commit -m "feat(home): TierShelf — tier-racked pack shelf, all taps to /slots"
```

---

### Task 5: HowItRips (board 03)

**Files:**
- Create: `src/components/home/HowItRips.tsx`

**Interfaces:**
- Consumes: `Reveal`.
- Produces: `export default function HowItRips()` — fully static server component.

- [ ] **Step 1: Create the board**

```tsx
// src/components/home/HowItRips.tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Reveal from '@/components/Reveal';

const STEPS = [
  {
    num: '01',
    title: 'BUY CREDITS',
    copy: 'Top up in seconds. RM in, credits out.',
  },
  {
    num: '02',
    title: 'RIP THE REEL',
    copy: 'Spin the pack. Watch the reveal land.',
  },
  {
    num: '03',
    title: "IT'S REAL",
    copy: (
      <>
        Every pull is a real graded slab — vault it, ship it, or sell back{' '}
        <span className="text-buyback-fg font-semibold">up to 90%</span>.
      </>
    ),
  },
] as const;

/**
 * Board 03 — HOW IT RIPS. Three numbered editorial rows; the old trust chips
 * live inside the step copy now (trust reads as how-it-works, not badges).
 */
export default function HowItRips() {
  return (
    <section aria-labelledby="how-heading" className="px-fluid mt-14 w-full">
      <div className="flex items-baseline justify-between">
        <h2 id="how-heading" className="font-heading text-2xl text-white">
          HOW IT RIPS
        </h2>
        <Link
          href="/how-it-works"
          className="flex min-h-11 items-center gap-1 text-[13px] font-semibold text-neutral-400 transition-colors hover:text-white"
        >
          How it works
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row">
        {STEPS.map((step, i) => (
          <Reveal key={step.num} delay={i * 90} className="flex-1">
            <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-neutral-900 p-4">
              <span className="font-heading text-4xl leading-none text-neutral-700">
                {step.num}
              </span>
              <div>
                <p className="font-heading text-base text-white">{step.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">
                  {step.copy}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/HowItRips.tsx
git commit -m "feat(home): HowItRips — three-step trust board"
```

---

### Task 6: Restyle RecentPullsSection (board 04)

**Files:**
- Modify: `src/components/RecentPullsSection.tsx`

**Interfaces:**
- Consumes: existing `useLiveRecentPulls`, `SlabImage`, `PEDESTAL_BG`, `PEDESTAL_FRAME_HOVER`; `rarityRgb` from `@/lib/rarity`; existing `fadeIn` keyframe.
- Produces: same export signature (`RecentPullsSection({ initialPulls })`) — page.tsx keeps calling it unchanged.

- [ ] **Step 1: Apply the restyle.** Three changes, keeping the polling/empty-state/scroll mechanics as they are:

1. **Header** — replace the centered header block with a left-aligned drop lockup + LIVE chip:

```tsx
        {/* Header — drop-board lockup */}
        <div className="px-fluid mb-6 flex items-baseline gap-3">
          <h2
            id="recent-pulls-heading"
            className="font-heading text-2xl text-white"
          >
            JUST PULLED
          </h2>
          <span className="flex items-center gap-1.5 rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] font-semibold text-white">
            {/* White dot — LIVE is not a money signal, so no green (Signal Rule) */}
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none"
              aria-hidden
            />
            LIVE
          </span>
        </div>
```

(Adjust the section wrapper: `py-16 sm:py-20` → `mt-14 py-0`, drop the `mx-auto max-w-2xl … text-center` block entirely; the feed row gains `px-fluid` so alignment matches the other boards.)

2. **PullCard** — wrap in a `Link href="/slots"` (routing rule), add value + rarity ring, entrance fade:

```tsx
function PullCard({ pull }: { pull: RecentPull }) {
  return (
    <Link
      href="/slots"
      className={cn(
        'group/card block w-[240px] shrink-0 overflow-hidden rounded-2xl',
        'animate-[fadeIn_400ms_ease-out] motion-reduce:animate-none',
        'border bg-neutral-800',
        PEDESTAL_FRAME_HOVER,
      )}
      style={{ borderColor: `rgba(${rarityRgb(pull.rarity)}, 0.35)` }}
    >
```

…and inside the footer, above the pack row, add the value line:

```tsx
          <p className="font-heading text-lg text-white">{pull.value}</p>
```

3. **Imports** — add `Link` from `next/link` and `rarityRgb` from `@/lib/rarity`; the `hover:border-neutral-500` class is replaced by the rarity border (delete it).

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/RecentPullsSection.tsx
git commit -m "feat(home): JUST PULLED restyle — value, rarity ring, LIVE chip, /slots links"
```

---

### Task 7: TheGame (board 05)

**Files:**
- Create: `src/components/home/TheGame.tsx`

**Interfaces:**
- Consumes: `LeaderboardEntry` from `@/lib/data/leaderboard`; `Reveal`.
- Produces: `export default function TheGame({ topRippers }: { topRippers: LeaderboardEntry[] })` — medals moment hidden when the array is empty; **no stat trio in Phase 1** (that is Phase 3; never render fake zeros).

- [ ] **Step 1: Create the board**

```tsx
// src/components/home/TheGame.tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import Reveal from '@/components/Reveal';
import type { LeaderboardEntry } from '@/lib/data/leaderboard';

/** Medal disc colors, rank 1→3 (gold / silver / bronze). */
const MEDAL = ['#eab308', '#a3a3a3', '#b45309'] as const;

/**
 * Board 05 — THE FLOOR PAYS OUT. Phase 1 renders two moments: top-3 weekly
 * rippers (hidden when the ledger is empty) and the VIP/referral loop teaser.
 * The stat trio (paid out / packs ripped / collectors) arrives with the Phase 3
 * backend aggregate — no fake zeros before then.
 */
export default function TheGame({
  topRippers,
}: {
  topRippers: LeaderboardEntry[];
}) {
  const podium = topRippers.slice(0, 3);

  return (
    <section aria-labelledby="game-heading" className="px-fluid mt-14 w-full">
      <h2 id="game-heading" className="font-heading text-2xl text-white">
        THE FLOOR PAYS OUT
      </h2>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row">
        {podium.length > 0 && (
          <Reveal className="flex-1">
            <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Top rippers this week
                </p>
                <Link
                  href="/leaderboard"
                  className="flex min-h-11 items-center gap-1 text-[13px] font-semibold text-neutral-400 transition-colors hover:text-white"
                >
                  See ranks
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
              <ol className="mt-2 flex flex-col gap-2">
                {podium.map((entry, i) => (
                  <li key={entry.rank} className="flex items-center gap-3">
                    <span
                      className="font-heading flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-neutral-950"
                      style={{ backgroundColor: MEDAL[i] }}
                    >
                      {entry.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
                      {entry.name}
                    </span>
                    <span className="font-heading whitespace-nowrap text-base text-white">
                      {entry.volume}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        )}

        <Reveal delay={90} className="flex-1">
          <div className="flex h-full flex-col justify-between rounded-2xl border border-white/10 bg-neutral-900 p-4">
            <div>
              <p className="font-heading text-lg leading-snug text-white">
                100 VIP LEVELS. TWO-TIER REFERRALS.
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">
                Every rip levels you up — and your crew&apos;s rips pay you
                twice.
              </p>
            </div>
            <Link
              href="/how-it-works"
              className="mt-3 flex min-h-11 w-fit items-center gap-1 text-[13px] font-semibold text-neutral-400 transition-colors hover:text-white"
            >
              Learn more
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/TheGame.tsx
git commit -m "feat(home): TheGame — weekly podium + VIP/referral teaser board"
```

---

### Task 8: FinalCta (board 06)

**Files:**
- Create: `src/components/home/FinalCta.tsx`

**Interfaces:**
- Consumes: `pillVariants`; `Reveal`.
- Produces: `export default function FinalCta()` — static.

- [ ] **Step 1: Create the closer**

```tsx
// src/components/home/FinalCta.tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Reveal from '@/components/Reveal';
import { pillVariants } from '@/components/ui/pill';

/** Board 06 — the closer. One lockup, one pill, one reassurance line. */
export default function FinalCta() {
  return (
    <Reveal as="section" className="px-fluid mt-16 w-full pb-4">
      <div className="flex flex-col items-center py-10 text-center">
        <p className="font-heading text-5xl leading-[0.95] text-white lg:text-7xl">
          YOUR CHASE
          <br />
          IS WAITING
        </p>
        <Link
          href="/slots"
          className={cn(pillVariants({ variant: 'primary', size: 'lg' }), 'mt-8')}
        >
          RIP A PACK
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <p className="mt-4 text-[13px] text-neutral-400">
          Real graded slabs · Up to 90% buyback
        </p>
      </div>
    </Reveal>
  );
}
```

- [ ] **Step 2: Typecheck** — Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/home/FinalCta.tsx
git commit -m "feat(home): FinalCta — closer board"
```

---

### Task 9: Recompose `src/app/page.tsx`

**Files:**
- Modify: `src/app/page.tsx` (full rewrite of the composition; `FeaturedChase`, `TrustRow`, `PackTile` are deleted — their jobs moved into the boards)

**Interfaces:**
- Consumes: every board component above; `getLeaderboard` joins the existing `Promise.all`.
- Produces: the page. `CHASE_LOOKUPS` rises 8 → 16 (spec: cover visible shelf tiles; beyond 16 the tile just omits its chase line).

- [ ] **Step 1: Rewrite the page**

```tsx
// src/app/page.tsx
import {
  getPackCategories,
  getPackDetail,
  getRecentPulls,
} from '@/lib/data/packs';
import { getLeaderboard } from '@/lib/data/leaderboard';
import { priceNumber, type PackCard } from '@/lib/packs-data';
import HeroBoard from '@/components/home/HeroBoard';
import PullsMarquee from '@/components/home/PullsMarquee';
import TierShelf from '@/components/home/TierShelf';
import HowItRips from '@/components/home/HowItRips';
import RecentPullsSection from '@/components/RecentPullsSection';
import TheGame from '@/components/home/TheGame';
import FinalCta from '@/components/home/FinalCta';

// Pack catalog + live pulls come fresh from the backend on every request.
export const dynamic = 'force-dynamic';

/** How many shelf tiles get a per-pack top-chase lookup (one request each). */
const CHASE_LOOKUPS = 16;

export default async function HomePage() {
  const [categories, pulls, topRippers] = await Promise.all([
    getPackCategories(),
    getRecentPulls(),
    // [] on any backend failure — TheGame hides the podium then.
    getLeaderboard('weekly'),
  ]);
  const packs = categories.flatMap((c) => c.packs);
  const inStock = packs.filter((p) => p.inStock !== false);
  const featured = [...inStock].sort(
    (a, b) => priceNumber(b.price) - priceNumber(a.price),
  )[0];

  // Chase lookups cover the first N tiles PLUS the featured pack, so the hero
  // never silently loses its chase when featured falls outside the first N.
  const lookupPacks = [
    ...new Set([
      ...(featured ? [featured] : []),
      ...packs.slice(0, CHASE_LOOKUPS),
    ]),
  ];
  const details = await Promise.all(
    lookupPacks.map((p) => getPackDetail(p.id)),
  );
  const chaseByPack = new Map<string, PackCard | null>(
    lookupPacks.map((p, i) => [p.id, details[i]?.topHits[0] ?? null]),
  );

  const featuredChase = featured
    ? (chaseByPack.get(featured.id) ?? null)
    : null;

  return (
    // Full-bleed by design (CLAUDE.md): boards carry their own px-fluid
    // gutters; the marquee is the one true edge-to-edge band.
    <div className="w-full">
      {/* 01 — the spotlight slab. No packs → the shelf empty state leads. */}
      {featured && <HeroBoard pack={featured} chase={featuredChase} />}

      {/* seam — live pulls marquee (absent when no pulls) */}
      <PullsMarquee pulls={pulls} />

      {/* 02 — tier-racked shelf */}
      <TierShelf packs={packs} chaseByPack={chaseByPack} />

      {/* 03 — trust engine */}
      <HowItRips />

      {/* 04 — live proof */}
      <RecentPullsSection initialPulls={pulls} />

      {/* 05 — podium + loop teaser */}
      <TheGame topRippers={topRippers} />

      {/* 06 — closer */}
      <FinalCta />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint + unit tests**

Run: `npm run typecheck && npx eslint src/app/page.tsx src/components/home src/components/RecentPullsSection.tsx && npm run test`
Expected: all clean / pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: compiles; `/` renders as dynamic route.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): compose The Drop Board — six-board hype funnel to /slots"
```

---

### Task 10: DESIGN.md deltas

**Files:**
- Modify: `DESIGN.md` (append to §5 Components; amend §6 Don'ts)

- [ ] **Step 1: Append a "Home / Drop Board patterns" block to §5** (after "Signature: Sticky Stat Card"):

```markdown
### Signature: Drop Board (home)

The home page is a six-board editorial scroll story (spec:
`docs/superpowers/specs/2026-07-14-home-redesign-design.md`). Its patterns:

- **Data marquee** — a slim full-bleed band streaming REAL signal (live pulls:
  masked name, Nekst value, rarity dot, age). CSS-only loop (`sp-scroll-x`),
  pauses on hover/press, static swipeable row under reduced motion. Decorative
  word-loop marquees remain prohibited — a marquee must carry data a collector
  can act on. The whole band is one link.
- **Board lockup** — ALL-CAPS Nekst section head, optionally paired with a
  right-aligned quiet text link (`All packs →`). One lockup per board.
- **Spotlight slab** — the hero object lit by its own rarity glow
  (`rarityRgb`), idle float (`slabFloat`, ±8px/6s) plus a subtle scroll-linked
  tilt. Reduced motion: perfectly still, fully lit. The glow hue is always
  inherited from the thing glowing (Glow Is Earned).
- **Tier rack** — shelf rows grouped by the shipped six price tiers
  (`price-tier.ts`: common → immortal), rack chip + hairline in the tier hue.
  (Note: supersedes the aspirational starter/silver/gold/diamond band in §2 —
  packs use the six-tier axis in shipped code.)
```

- [ ] **Step 2: Amend §6** — in the Don'ts list, extend the marquee-adjacent rule: change the "decorative grid/stripe backgrounds" bullet to end with: `Data marquees (see Drop Board) are the one sanctioned moving band — decorative word loops stay banned.`

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): Drop Board patterns — data marquee, board lockup, spotlight slab, tier rack"
```

---

### Task 11: Playwright QA + full verification

**Files:**
- Create: `scripts/qa-home-redesign.mjs` (modeled on the existing `scripts/qa-*.mjs` one-off pattern)

- [ ] **Step 1: Write the QA script**

```js
// scripts/qa-home-redesign.mjs
// One-off QA: screenshots of the Drop Board home at phone/desktop, plus a
// reduced-motion pass and the routing-rule audit (every product tap → /slots).
// Usage: node scripts/qa-home-redesign.mjs   (expects the standalone server)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.PW_BASE ?? 'http://localhost:4000';
const OUT = 'docs/research';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
try {
  for (const [name, viewport, reducedMotion] of [
    ['home-drop-phone', { width: 390, height: 844 }, 'no-preference'],
    ['home-drop-desktop', { width: 1440, height: 900 }, 'no-preference'],
    ['home-drop-phone-reduced', { width: 390, height: 844 }, 'reduce'],
  ]) {
    const ctx = await browser.newContext({ viewport, reducedMotion });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/${name}-top.png` });
    await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });

    // Routing-rule audit: every anchor inside the six boards that shows a
    // product must point at exactly "/slots".
    const offenders = await page.$$eval('main a[href^="/slots/"]', (as) =>
      as.map((a) => a.getAttribute('href')),
    );
    console.log(
      offenders.length === 0
        ? `[${name}] routing rule OK — no /slots/<pack> links on home`
        : `[${name}] ROUTING VIOLATIONS: ${offenders.join(', ')}`,
    );
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('screenshots in', OUT);
```

- [ ] **Step 2: Build + serve + run**

```bash
npm run build
pwsh scripts/serve-standalone.ps1 -Port 4100   # background; worktree uses 4100 (memory: 4000 can serve the main tree's stale bundle)
PW_BASE=http://localhost:4100 node scripts/qa-home-redesign.mjs
```

Expected: three viewport passes, `routing rule OK` on each, six PNGs in `docs/research/`.

- [ ] **Step 3: Read the PNGs back with the Read tool and judge against the spec** — hero fills the first viewport with slab + gold value + pill; marquee band present; racks ordered high tier first; boards aligned on `px-fluid`; reduced-motion pass shows everything visible/static.

- [ ] **Step 4: Full gate**

Run: `npm run check && npm run test`
Expected: lint + typecheck + build + vitest all green.

- [ ] **Step 5: Commit the QA script**

```bash
git add scripts/qa-home-redesign.mjs
git commit -m "test(home): Drop Board QA script — viewports, reduced motion, routing audit"
```

- [ ] **Step 6: `/code-review` the branch diff, fix CRITICAL/HIGH, then PR** to `master` titled `feat(home): The Drop Board — mobile-first home redesign (phase 1)`.

---

## Phases 2–3 (separate plans, not this document)

- **Phase 2 — the shell:** header transparent-over-hero + scroll fade; tab bar active dot + press micro-scale; inactive icon contrast bump. (Spec §App shell.)
- **Phase 3 — the stats:** Medusa `GET /store/stats` aggregate + stat trio with count-up in `TheGame`. (Spec §Data & backend.)
