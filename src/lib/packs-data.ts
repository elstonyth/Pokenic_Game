// Pack catalog TYPES + presentational category meta (labels/icons) + the
// statically-published odds display. Pack `id` doubles as the route slug
// (/slots/<id>).
//
// NOTE: the LIVE pack list comes entirely from the backend (the source of
// truth) via src/lib/data/packs.ts — the static pack entries below are never
// rendered as catalog; they only back `findPack` label lookups (recent-pull
// pack names/icons) until that feed resolves labels from the backend too.

/** Site-wide flat buyback % — what every sell from the vault/inventory pays.
 *  Mirrors FLAT_PERCENT in backend/packages/api/src/modules/packs/buyback-rate.ts. */
export const FLAT_BUYBACK_PERCENT = 90;

export type Pack = {
  id: string;
  name: string;
  price: string;
  /** Pack shot — /public path (public/images/polycards/) or an uploaded URL. */
  image: string;
  /** Pack-page HERO scene (wide landscape "factory" render, may be animated).
   *  Only the /slots/<slug> stage uses it; tiles/selector always use `image`.
   *  Absent → the stage falls back to the pack image. */
  displayImage?: string;
  /** Shows the green buyback-boost badge on the card. */
  boost?: boolean;
  /** INSTANT ("sell on the spot") buyback % — also the boost-badge number
   *  (default 90 = the flat rate). Later sells from the vault always pay
   *  FLAT_BUYBACK_PERCENT. */
  buybackPercent?: number;
  /** false → render a greyed "Out of Stock" / "Sold out" tile. Default in-stock. */
  inStock?: boolean;
};

export type PackCategory = {
  id: string;
  /** Tab label in the top filter bar. */
  tab: string;
  /** Section heading above the grid. */
  heading: string;
  /** Small category badge icon. */
  icon: string;
  packs: Pack[];
};

// Category badge icons (localized to public/pack-index-icons/).
export const CAT_ICON = {
  pokemon: '/pack-index-icons/pokemon.webp',
} as const;

// The Polycards tier ladder (2026-07 catalog cutover — the old claw-derived
// 8-pack catalog was retired). These static entries are NEVER rendered as the
// catalog (the backend is the source of truth); they only back `findPack`
// label/icon fallbacks until that feed resolves labels from the backend too.
export const CATEGORIES: PackCategory[] = [
  {
    id: 'pokemon',
    tab: 'Pokémon',
    heading: 'Pokémon Packs',
    icon: CAT_ICON.pokemon,
    packs: [
      {
        id: 'bronze-pack',
        name: 'Bronze Pack',
        price: 'RM 50',
        image: '/images/polycards/bronze-pack.webp',
        displayImage: '/images/polycards/bronze-factory.webp',
      },
      {
        id: 'silver-pack',
        name: 'Silver Pack',
        price: 'RM 250',
        image: '/images/polycards/silver-pack.webp',
        displayImage: '/images/polycards/silver-factory.webp',
      },
      {
        id: 'gold-pack',
        name: 'Gold Pack',
        price: 'RM 1,000',
        image: '/images/polycards/gold-pack.webp',
        displayImage: '/images/polycards/gold-factory.webp',
      },
      {
        id: 'platinum-pack',
        name: 'Platinum Pack',
        price: 'RM 2,500',
        image: '/images/polycards/platinum-pack.webp',
        displayImage: '/images/polycards/platinum-factory.webp',
      },
      {
        id: 'diamond-pack',
        name: 'Diamond Pack',
        price: 'RM 5,000',
        image: '/images/polycards/diamond-pack.webp',
        displayImage: '/images/polycards/diamond-factory.webp',
      },
    ],
  },
];

export type ResolvedPack = Pack & {
  categoryId: string;
  categoryName: string;
  icon: string;
};

export const ALL_PACKS: ResolvedPack[] = CATEGORIES.flatMap((c) =>
  c.packs.map((p) => ({
    ...p,
    categoryId: c.id,
    categoryName: c.tab,
    icon: c.icon,
  })),
);

export function findPack(slug: string): ResolvedPack | null {
  return ALL_PACKS.find((p) => p.id === slug) ?? null;
}

export function findCategory(slug: string): PackCategory | null {
  return CATEGORIES.find((c) => c.packs.some((p) => p.id === slug)) ?? null;
}

/** Numeric price, e.g. "RM 1,000" -> 1000. */
export function priceNumber(price: string): number {
  return parseFloat(price.replace(/^RM\s*/, '').replace(/,/g, '')) || 0;
}

// ---------------------------------------------------------------------------
// Card display types + the statically-published odds (real pool data comes
// from the backend — the storefront renders no mock cards).
// ---------------------------------------------------------------------------

export type Rarity =
  'Immortal' | 'Legendary' | 'Mythical' | 'Rare' | 'Uncommon' | 'Common';
export type PackCard = {
  id: string;
  name: string;
  image: string;
  slabImage: string | null;
  value: string;
  rarity: Rarity;
  /** The card's CONFIGURED pixel-Pokémon (mirror of its linked library entry),
   *  from the store route. Lets the slot reel flicker the pack's actual
   *  configured Pokémon. Optional: only the pool/top-hits carry it. */
  pokemonDex?: number | null;
  spriteImage?: string | null;
};

// Per-rarity pull odds — the statically-PUBLISHED display, decoupled by design
// from the backend's secret per-card weights (admin-configurable in Step 4).
// All six tiers, rarest first; dots match RARITY_RGB in src/lib/rarity.ts.
export const ODDS: { rarity: Rarity; chance: string; dot: string }[] = [
  { rarity: 'Immortal', chance: '0.1%', dot: 'bg-orange-400' },
  { rarity: 'Legendary', chance: '0.4%', dot: 'bg-pink-500' },
  { rarity: 'Mythical', chance: '4.5%', dot: 'bg-purple-500' },
  { rarity: 'Rare', chance: '15%', dot: 'bg-blue-600' },
  { rarity: 'Uncommon', chance: '30%', dot: 'bg-sky-400' },
  { rarity: 'Common', chance: '50%', dot: 'bg-neutral-400' },
];
