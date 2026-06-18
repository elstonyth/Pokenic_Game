# Slot Machine v2 — Phase A′ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase A′ foundation for slot-machine v2 — two pure helpers (`priceTier`, `pokemonFromCard`), the `PokemonToken` reel-cell component, and a lean dedicated `/slots` configurator — without touching the win-rate lock or the claw component.

**Architecture:** Helpers are pure, TDD'd modules under `src/lib/`. `PokemonToken` is a presentational client component mirroring the existing `PokeSprite` gif→png fallback, with a tier-colored grow/glow. The `/slots` configurator follows the repo's server→client split (`page.tsx` server + metadata → `SlotsConfigClient.tsx` client), reuses the existing `QtyStepper` and the live pack-data loader, and links each pack to `/slots/[slug]?count=N`. It is NOT a fork of `PackDetailClient` (spec G1).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript strict, Tailwind v4, Vitest (unit), Lucide icons.

## Global Constraints

- Work in the worktree `C:\Users\PC\Desktop\Projects\Pokenic_Game\.worktrees\slot-machine-v2`, branch `feat/slot-machine-v2` (`npm install` already run). All paths below are relative to that worktree root.
- TypeScript strict, **no `any`**; named exports; PascalCase components, camelCase utils; 2-space indent; Tailwind classes, no inline styles.
- Unit tests use **Vitest**; test files live in **`src/lib/__tests__/<feature>.test.ts`** importing the module via `../` (NOT `@/`). Run a single file: `npx vitest run src/lib/__tests__/<feature>.test.ts`. Run all: `npm test`.
- **No jsdom/component-test environment is configured** (vitest `include: ['src/**/*.test.ts']`, no `environment`). Presentational components (`PokemonToken`, configurator) are therefore **not** unit-tested — they are verified by typecheck + the Playwright/standalone capture loop per `.claude/rules/common/testing.md`.
- The win-rate lock and `/claw/*` are **untouched**. `PackDetailClient` is **not** modified or forked.
- A PostToolUse hook type-checks after every `.ts`/`.tsx` edit; a Stop hook type-checks storefront + backend. Keep the tree green.
- Sprite source of truth: `dex = POKEDEX_NAMES index + 1` (verified pure national-dex, 1025 entries). `spriteGif(dex)` / `spritePng(dex)` from `@/lib/mock/pokedex`.

---

### Task 1: `priceTier` + `TIER_COLOR` (pure helper, TDD)

**Files:**
- Create: `src/lib/price-tier.ts`
- Test: `src/lib/__tests__/price-tier.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type Tier = 'common' | 'uncommon' | 'rare' | 'mythical' | 'legendary' | 'immortal';`
  - `export function priceTier(value: number): Tier`
  - `export const TIER_COLOR: Record<Tier, string>` — RGB triples as `"r, g, b"` strings (mirrors `RARITY_RGB` shape in `src/lib/mock/cards.ts:115`).

**Band semantics (crisp, from spec §3 — half-open intervals, upper-exclusive):**
`< 25` common · `< 100` uncommon · `< 500` rare · `< 2000` mythical · `< 10000` legendary · else immortal. Non-finite (`NaN`/`Infinity`) → `common`. Negative/zero → `common`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/price-tier.test.ts
import { describe, it, expect } from 'vitest';
import { priceTier, TIER_COLOR, type Tier } from '../price-tier';

describe('priceTier', () => {
  it('buckets each band by upper-exclusive boundary', () => {
    expect(priceTier(0)).toBe('common');
    expect(priceTier(24.99)).toBe('common');
    expect(priceTier(25)).toBe('uncommon');
    expect(priceTier(99.99)).toBe('uncommon');
    expect(priceTier(100)).toBe('rare');
    expect(priceTier(499.99)).toBe('rare');
    expect(priceTier(500)).toBe('mythical');
    expect(priceTier(1999.99)).toBe('mythical');
    expect(priceTier(2000)).toBe('legendary');
    expect(priceTier(9999.99)).toBe('legendary');
    expect(priceTier(10000)).toBe('immortal');
    expect(priceTier(250000)).toBe('immortal');
  });

  it('treats non-finite and non-positive values as common (never immortal)', () => {
    expect(priceTier(Number.NaN)).toBe('common');
    expect(priceTier(Number.POSITIVE_INFINITY)).toBe('common');
    expect(priceTier(-5)).toBe('common');
  });

  it('TIER_COLOR has an RGB triple for every tier', () => {
    const tiers: Tier[] = [
      'common',
      'uncommon',
      'rare',
      'mythical',
      'legendary',
      'immortal',
    ];
    for (const t of tiers) {
      expect(TIER_COLOR[t]).toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/price-tier.test.ts`
Expected: FAIL — `Failed to resolve import "../price-tier"` (module does not exist).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/price-tier.ts
export type Tier =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'mythical'
  | 'legendary'
  | 'immortal';

/**
 * Bucket a card's USD market value into one of six glow tiers (spec §3).
 * Upper-exclusive bands; non-finite / non-positive values fall back to `common`
 * so a NaN can never read as `immortal`. Tier is by PRICE, independent of the
 * card's `rarity` field.
 */
export function priceTier(value: number): Tier {
  if (!Number.isFinite(value) || value < 25) return 'common';
  if (value < 100) return 'uncommon';
  if (value < 500) return 'rare';
  if (value < 2000) return 'mythical';
  if (value < 10000) return 'legendary';
  return 'immortal';
}

/** Glow RGB (as "r, g, b") per tier — feed `rgba(${TIER_COLOR[t]}, a)`. */
export const TIER_COLOR: Record<Tier, string> = {
  common: '156, 163, 175', // #9ca3af gray
  uncommon: '125, 211, 252', // #7dd3fc light blue
  rare: '37, 99, 235', // #2563eb deep blue
  mythical: '168, 85, 247', // #a855f7 purple
  legendary: '244, 114, 182', // #f472b6 bright pink
  immortal: '251, 146, 60', // #fb923c orange
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/price-tier.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/price-tier.ts src/lib/__tests__/price-tier.test.ts
git commit -m "feat(slots-v2): priceTier + TIER_COLOR 6-tier price helper (TDD)"
```

---

### Task 2: `pokemonFromCard` (pure helper, TDD)

**Files:**
- Create: `src/lib/pokemon-from-card.ts`
- Test: `src/lib/__tests__/pokemon-from-card.test.ts`

**Interfaces:**
- Consumes: `POKEDEX_NAMES` from `src/lib/mock/pokedex-names.ts` (1025 entries, `dex = index + 1`).
- Produces:
  - `export type CardPokemon = { dex: number; name: string };`
  - `export function pokemonFromCard(cardName: string): CardPokemon | null`

**Algorithm (spec §2 — normalized longest-match):** lowercase + strip every non-`[a-z0-9]` char (this folds away hyphens, apostrophes, colons, dots, spaces, and gender symbols on BOTH sides) → match the **longest** normalized dex name that is a substring of the normalized card name → return its `dex` + canonical `POKEDEX_NAMES` label. Longest-first disambiguates nested names ("mewtwo" beats "mew"). Returns `null` for trainer/energy cards and for form-labeled dex entries when the card omits the form word (e.g. "Deoxys ex" vs the dex label "Deoxys Normal") — that null is handled by the §2/G5 fallback visual downstream.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/pokemon-from-card.test.ts
import { describe, it, expect } from 'vitest';
import { pokemonFromCard } from '../pokemon-from-card';

describe('pokemonFromCard', () => {
  it('finds the base Pokémon in a real card name', () => {
    expect(pokemonFromCard('2021 Scarlet & Violet 151 Charizard ex PSA 10')).toEqual({
      dex: 6,
      name: 'Charizard',
    });
    expect(pokemonFromCard('2022 Crown Zenith Pikachu VMAX CGC 10')).toEqual({
      dex: 25,
      name: 'Pikachu',
    });
  });

  it('prefers the longest match (Mewtwo over Mew)', () => {
    expect(pokemonFromCard('Mewtwo ex')).toEqual({ dex: 150, name: 'Mewtwo' });
    expect(pokemonFromCard('Mew ex')).toEqual({ dex: 151, name: 'Mew' });
  });

  it('normalizes punctuation on both sides (hyphen, apostrophe, dot, colon)', () => {
    expect(pokemonFromCard('Ho-Oh V')).toEqual({ dex: 250, name: 'Ho Oh' });
    expect(pokemonFromCard("Farfetch'd")).toEqual({ dex: 83, name: 'Farfetchd' });
    expect(pokemonFromCard('Mr. Mime')).toEqual({ dex: 122, name: 'Mr Mime' });
    expect(pokemonFromCard('Type: Null')).toEqual({ dex: 772, name: 'Type Null' });
  });

  it('returns null for non-Pokémon cards and empty input', () => {
    expect(pokemonFromCard("Professor's Research")).toBeNull();
    expect(pokemonFromCard('')).toBeNull();
    expect(pokemonFromCard('   ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/pokemon-from-card.test.ts`
Expected: FAIL — `Failed to resolve import "../pokemon-from-card"`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/pokemon-from-card.ts
import { POKEDEX_NAMES } from './mock/pokedex-names';

export type CardPokemon = { dex: number; name: string };

/** Fold to comparison form: lowercase, drop every non-alphanumeric char. */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Build once: every dex name in normalized form, sorted LONGEST-FIRST so the
// first substring hit is the most specific Pokémon ("mewtwo" before "mew").
const INDEX: ReadonlyArray<{ dex: number; norm: string }> = POKEDEX_NAMES.map(
  (name, i) => ({ dex: i + 1, norm: normalize(name) }),
)
  .filter((e) => e.norm.length > 0)
  .sort((a, b) => b.norm.length - a.norm.length);

/**
 * Parse the Pokémon out of a card name (spec §2). Normalized longest-match
 * against the national Pokédex. Returns null for cards with no resolvable
 * Pokémon (trainer/energy, or a form-labeled dex entry whose form word the card
 * omits) — callers render the §2/G5 fallback (card image, no sprite).
 */
export function pokemonFromCard(cardName: string): CardPokemon | null {
  const hay = normalize(cardName);
  if (!hay) return null;
  for (const { dex, norm } of INDEX) {
    if (hay.includes(norm)) return { dex, name: POKEDEX_NAMES[dex - 1] };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/pokemon-from-card.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pokemon-from-card.ts src/lib/__tests__/pokemon-from-card.test.ts
git commit -m "feat(slots-v2): pokemonFromCard normalized longest-match helper (TDD)"
```

---

### Task 3: `PokemonToken` reel-cell component (presentational)

**Files:**
- Create: `src/app/slots/[slug]/PokemonToken.tsx`

**Interfaces:**
- Consumes: `spriteGif`, `spritePng` from `@/lib/mock/pokedex`; `Tier`, `TIER_COLOR` from `@/lib/price-tier` (Task 1); `cn` from `@/lib/utils`.
- Produces: `export function PokemonToken(props: PokemonTokenProps)` where
  ```typescript
  type PokemonTokenProps = {
    dex: number;
    name: string;
    tier: Tier;
    /** Cell pixel size (square). Default 96. */
    size?: number;
    /** When true, the winner grows + glows (the reveal beat). */
    landed?: boolean;
    /** prefers-reduced-motion: no pulse/scale transition; static glow only. */
    reduced?: boolean;
  };
  ```

**Notes:** No unit test (no jsdom env; presentational → visual verification). It mirrors the `PokeSprite` gif→png fallback verbatim and adds a tier-colored glow ring driven by `TIER_COLOR[tier]`. It is built as a standalone unit here; the reel that mounts it is Phase B, so Phase A′ verification is typecheck-only (it has no render site yet — that is expected, not a gap).

- [ ] **Step 1: Create the component**

```tsx
// src/app/slots/[slug]/PokemonToken.tsx
'use client';

import { useState } from 'react';
import { spriteGif, spritePng } from '@/lib/mock/pokedex';
import { TIER_COLOR, type Tier } from '@/lib/price-tier';
import { cn } from '@/lib/utils';

type PokemonTokenProps = {
  dex: number;
  name: string;
  tier: Tier;
  /** Cell pixel size (square). Default 96. */
  size?: number;
  /** When true, the winner grows + glows (the reveal beat). */
  landed?: boolean;
  /** prefers-reduced-motion: no pulse/scale transition; static glow only. */
  reduced?: boolean;
};

/**
 * A single Pokémon reel cell (spec §2). Animated showdown sprite with a static
 * PNG fallback (same pattern as PokedexClient's PokeSprite). On `landed`, the
 * sprite scales up and gains a glow ring colored by the card's price tier (§3).
 * Under reduced motion the glow is shown statically with no scale/pulse.
 */
export function PokemonToken({
  dex,
  name,
  tier,
  size = 96,
  landed = false,
  reduced = false,
}: PokemonTokenProps) {
  const [src, setSrc] = useState(spriteGif(dex));
  const rgb = TIER_COLOR[tier];
  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-2xl',
        !reduced && 'transition-transform duration-300 ease-out',
        landed && !reduced && 'scale-110',
      )}
      style={{
        width: size,
        height: size,
        boxShadow: landed
          ? `0 0 18px 4px rgba(${rgb}, 0.85), 0 0 42px 10px rgba(${rgb}, 0.45)`
          : 'none',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setSrc((s) => (s === spritePng(dex) ? s : spritePng(dex)))}
        className="h-[80%] w-auto max-w-[80%] object-contain [image-rendering:auto]"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS (no errors). The PostToolUse hook also runs this automatically after the edit.

- [ ] **Step 3: Commit**

```bash
git add "src/app/slots/[slug]/PokemonToken.tsx"
git commit -m "feat(slots-v2): PokemonToken reel cell (sprite + tier grow/glow)"
```

---

### Task 4: Lean `/slots` configurator (server page + client)

**Files:**
- Create: `src/app/slots/page.tsx` (server component, exports `metadata`)
- Create: `src/app/slots/SlotsConfigClient.tsx` (`'use client'`)

**Interfaces:**
- Consumes: `getPackCategories` from `@/lib/data/packs`; `type Pack` from `@/app/claw/packs-data`; `QtyStepper` (default export) from `@/components/QtyStepper`; `money` from `@/lib/format`; `cn` from `@/lib/utils`; `next/link`, `next/image`.
- Produces: routes `/slots` → renders tiles; each Play links to `/slots/[slug]?count=N` (slug = `pack.id`, N = chosen 1–3 quantity). No exported symbols consumed by later tasks.

**Notes:** Mirrors the `marketplace/page.tsx` → `MarketplaceClient.tsx` server→client split. Reuses the existing `QtyStepper` (controlled, clamps `[1, max]`) with `max={3}`. Each tile owns its own quantity state. The `/slots/[slug]` page reading the `count` query param is Phase D (backend `open-batch`); A′ only emits the link. Does NOT import or modify `PackDetailClient`.

- [ ] **Step 1: Create the client component**

```tsx
// src/app/slots/SlotsConfigClient.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import QtyStepper from '@/components/QtyStepper';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Pack } from '@/app/claw/packs-data';

function PackTile({ pack }: { pack: Pack }) {
  const [qty, setQty] = useState(1);
  const soldOut = pack.inStock === false;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4',
        soldOut && 'opacity-50',
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-800">
        <Image
          src={pack.image}
          alt={pack.name}
          fill
          sizes="(max-width: 768px) 50vw, 240px"
          className="object-contain"
        />
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-sm font-bold text-neutral-50">
          {pack.name}
        </h3>
        <span className="text-sm tabular-nums text-neutral-300">
          {pack.price}
        </span>
      </div>
      <QtyStepper qty={qty} onChange={setQty} max={3} />
      {soldOut ? (
        <span className="rounded-xl bg-white/5 py-2 text-center text-xs font-bold uppercase tracking-wide text-neutral-500">
          Sold out
        </span>
      ) : (
        <Link
          href={`/slots/${pack.id}?count=${qty}`}
          className="rounded-xl bg-neutral-50 py-2 text-center text-sm font-bold text-neutral-900 transition-colors hover:bg-white"
        >
          Play
        </Link>
      )}
    </div>
  );
}

export default function SlotsConfigClient({ packs }: { packs: Pack[] }) {
  return (
    <main className="px-fluid py-10">
      <h1 className="font-heading text-3xl font-black text-neutral-50">
        Slot Machine
      </h1>
      <p className="mt-2 text-neutral-400">
        Pick a pack and how many to open (1–3), then spin.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {packs.map((pack) => (
          <PackTile key={pack.id} pack={pack} />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create the server page**

```tsx
// src/app/slots/page.tsx
import type { Metadata } from 'next';
import { getPackCategories } from '@/lib/data/packs';
import type { Pack } from '@/app/claw/packs-data';
import SlotsConfigClient from './SlotsConfigClient';

export const metadata: Metadata = {
  title: 'Slot Machine | Pokenic',
  description: 'Pick a pack, choose how many to open, and spin the reels.',
};

// Packs are read live from the Store API per request (reflects live inventory),
// same seam as /claw — degrade to the mock catalog inside the loader on failure.
export const dynamic = 'force-dynamic';

export default async function SlotsPage() {
  const categories = await getPackCategories();
  const packs: Pack[] = categories.flatMap((c) => c.packs);
  return <SlotsConfigClient packs={packs} />;
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS. If `categories.flatMap((c) => c.packs)` mistypes, inspect `getPackCategories`'s return type in `src/lib/data/packs.ts` and align the `Pack` import — do not introduce `any`.

- [ ] **Step 4: Build + verify the page renders on the standalone prod server**

```bash
npm run build
pwsh scripts/serve-standalone.ps1 -Port 4000   # run in background
```

Then capture `/slots` with a Playwright script (write `scripts/qa-slots-config.mjs` modeled on an existing `scripts/qa-*.mjs`) that navigates to `http://localhost:4000/slots`, screenshots to `docs/research/slots-config.png`, and asserts: at least one pack tile is present, and at least one `a[href^="/slots/"]` Play link contains `?count=`. Read the PNG back with the Read tool to confirm tiles render. (Verify on `:4000`, never `next dev` — per CLAUDE.md.)

Expected: tiles render with image + name + price + stepper + Play; Play hrefs look like `/slots/<id>?count=1`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/slots/page.tsx" "src/app/slots/SlotsConfigClient.tsx" scripts/qa-slots-config.mjs
git commit -m "feat(slots-v2): lean /slots configurator (pack tiles + qty 1-3 + Play)"
```

---

## Self-Review

**Spec coverage (Phase A′, §14):**
- ✅ Ball removal — already done (verified clean; not a task).
- ✅ `priceTier` + `TIER_COLOR` (§3) — Task 1.
- ✅ `pokemonFromCard` normalized longest-match + null fallback (§2) — Task 2.
- ✅ `PokemonToken` sprite + tier grow/glow (§2/§3) — Task 3.
- ✅ Lean `/slots` configurator, not a PackDetailClient fork (§5/G1) — Task 4.
- ⛔ Out of scope (deferred): vertical reel / `reelTargetY` (Phase B), route-group chrome (Phase B), `open-batch` + `count` consumption (Phase D), sell-back/view-card (Phase E). Correctly excluded.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. ✅

**Type consistency:** `Tier`/`TIER_COLOR` defined in Task 1, consumed by name in Task 3. `CardPokemon` defined+used in Task 2. `Pack` imported from `@/app/claw/packs-data` in Task 4 (server + client agree). `QtyStepper` is a **default** export (`import QtyStepper from '@/components/QtyStepper'`) — matches its source. `priceTier`'s NaN guard sits before the `< 25` check so non-finite never falls through to `immortal`. ✅

**Known limitation (documented, not a gap):** form-labeled dex entries ("Deoxys Normal") won't match a bare-name card; the current card pool uses base names, and unmatched cards hit the §2/G5 fallback. A curated alias map can be added in a later phase if the live card pool introduces form Pokémon.
