/**
 * Marketplace catalog data seam.
 *
 * Single source for the marketplace listing grid and the category tabs. Cards
 * are read live from the Medusa + Mercur Store API (`backend/`) — they are
 * seeded as products of an "open" house seller, priced in USD, with
 * card-specific facts (fmv/points/grade/grader/set/rarity/year) on
 * `product.metadata`. See `backend/packages/api/src/scripts/seed.ts`.
 * Single-card detail lookups live in `@/lib/data/cards` (`getCard`).
 *
 * Resilience: every getter degrades gracefully if the backend is unreachable
 * (e.g. a storefront build with no running backend) — the grid falls back to
 * an empty list, so the build never hard-fails on a transient backend outage.
 */

import type { HttpTypes } from '@medusajs/types';
import { sdk } from '@/lib/medusa';
import { logger } from '@/lib/logger';

export interface MarketplaceCard {
  id: string;
  title: string;
  price: number;
  fmv: number;
  points: number;
  image: string;
  /** Live MYR market price (display-only) — fmv x FX(USD->MYR) x market_multiplier.
   * Undefined if the FX rate couldn't be resolved (route/backend unreachable). */
  marketPriceMyr?: number;
}

export interface MarketplaceCategory {
  name: string;
  icon: string;
}

// Store API field selection: default fields + card `metadata` + each variant's
// region-resolved `calculated_price` (verified working against the backend).
const PRODUCT_FIELDS = '+metadata,*variants.calculated_price';
const PRODUCT_LIST_LIMIT = 100;

// The store prices cards in MYR (RM), so Store API calls pass the MYR region's id
// to resolve `calculated_price`. The in-flight promise is cached (so concurrent
// callers share one lookup instead of stampeding), but a miss or failure clears
// the cache so the next call retries — region ids are stable.
let storeRegionIdPromise: Promise<string | undefined> | null = null;
function getStoreRegionId(): Promise<string | undefined> {
  if (!storeRegionIdPromise) {
    storeRegionIdPromise = sdk.store.region
      .list()
      .then(({ regions }) => {
        const id = regions.find((r) => r.currency_code === 'myr')?.id;
        if (!id) storeRegionIdPromise = null; // not found — allow a later retry
        return id;
      })
      .catch((error) => {
        storeRegionIdPromise = null; // failed — allow a later retry
        throw error;
      });
  }
  return storeRegionIdPromise;
}

// Storefront port of the backend's displayMarketPrice (packs/pricing.ts) —
// same formula, kept in sync by hand (no cross-package import from the
// storefront into `backend/`). Used only for the marketplace listing price,
// which reads Mercur product data directly rather than a store route that
// could compute this server-side (see products.ts header + GET /store/pricing/fx).
function displayMarketPrice(
  fmvUsd: number,
  fxUsdMyr: number,
  multiplier: number,
): number {
  const raw = Number(fmvUsd);
  const fx = Number(fxUsdMyr);
  const mult = Number(multiplier);
  if (
    ![raw, fx, mult].every(Number.isFinite) ||
    raw < 0 ||
    fx <= 0 ||
    mult <= 0
  )
    return 0;
  return Math.round(raw * fx * mult * 100) / 100;
}

const DEFAULT_USD_MYR = 4.7;

// FX rate for the marketplace listing price, cached for a few minutes and
// shared across all cards in the grid (avoids stampeding the backend on every
// request while still picking up an admin FX override or the daily sync
// within a bounded delay — a process-lifetime cache would never see either
// without a restart). A miss/failure clears the cache so the next call
// retries. Falls back to DEFAULT_USD_MYR (never blocks the listing on a
// transient backend outage).
const FX_CACHE_TTL_MS = 5 * 60 * 1000;
let fxRatePromise: Promise<number> | null = null;
let fxRateCachedAt = 0;
function getFxRate(): Promise<number> {
  if (!fxRatePromise || Date.now() - fxRateCachedAt > FX_CACHE_TTL_MS) {
    fxRateCachedAt = Date.now();
    fxRatePromise = sdk.client
      .fetch<{ rate: number }>('/store/pricing/fx')
      .then(({ rate }) =>
        Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_MYR,
      )
      .catch((error) => {
        fxRatePromise = null;
        logger.error(
          '[marketplace] failed to load FX rate from backend:',
          error,
        );
        return DEFAULT_USD_MYR;
      });
  }
  return fxRatePromise;
}

// Coerce an untrusted `metadata` value to a finite number, else fall back —
// guards against a malformed seed value silently becoming `NaN` in the UI.
const toFinite = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const priceOf = (p: HttpTypes.StoreProduct): number =>
  p.variants?.[0]?.calculated_price?.calculated_amount ?? 0;
const imageOf = (p: HttpTypes.StoreProduct): string =>
  p.thumbnail ?? p.images?.[0]?.url ?? '';

function toMarketplaceCard(
  p: HttpTypes.StoreProduct,
  fxRate: number,
): MarketplaceCard {
  const meta = p.metadata ?? {};
  const price = priceOf(p);
  const fmv = toFinite(meta.fmv, price);
  return {
    id: p.handle,
    title: p.title,
    price,
    fmv,
    points: toFinite(meta.points, 0),
    image: imageOf(p),
    marketPriceMyr: displayMarketPrice(
      fmv,
      fxRate,
      toFinite(meta.market_multiplier, 1.2),
    ),
  };
}

// Category tabs match the live marketplace (icons localized to
// public/pack-index-icons/). Static this phase: all seeded cards are Pokémon
// and the tab icons are local assets, not backend-derived.
const CATEGORIES: MarketplaceCategory[] = [
  { name: 'Pokémon', icon: '/pack-index-icons/pokemon.webp' },
];

/** Marketplace listing grid — live from the Store API (empty on backend failure). */
export async function getMarketplaceCards(): Promise<MarketplaceCard[]> {
  try {
    const [region_id, fxRate] = await Promise.all([
      getStoreRegionId(),
      getFxRate(),
    ]);
    const { products } = await sdk.store.product.list({
      region_id,
      fields: PRODUCT_FIELDS,
      limit: PRODUCT_LIST_LIMIT,
    });
    return products.map((p) => toMarketplaceCard(p, fxRate));
  } catch (error) {
    logger.error('[marketplace] failed to load products from backend:', error);
    return [];
  }
}

/** Marketplace category tabs. Static this phase (local-asset icons). */
export function getMarketplaceCategories(): MarketplaceCategory[] {
  return CATEGORIES;
}
