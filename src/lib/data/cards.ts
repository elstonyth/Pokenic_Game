/**
 * Single-card detail seam (GET /store/cards/:handle) — powers the /card/[handle]
 * server page and (via the /api/cards proxy) the overlay's 60s price refresh.
 * Backend down / unknown handle ⇒ null (page 404s; overlay keeps grid data).
 */
import { sdk } from '@/lib/medusa';
import { logger } from '@/lib/logger';
import { CardDetailSchema, parseOne } from '@/lib/data/schemas';
import type { Rarity } from '@/lib/packs-data';

export interface CardPricePoint {
  date: string;
  valueMyr: number;
}

export interface CardDetailData {
  handle: string;
  name: string;
  set: string;
  grader: string;
  grade: string;
  image: string;
  marketPriceMyr: number;
  rarity: Rarity | null;
  pcSyncedAt: string | null;
  priceHistory: CardPricePoint[];
}

export async function getCard(handle: string): Promise<CardDetailData | null> {
  try {
    const { card } = await sdk.client.fetch<{ card: unknown }>(
      `/store/cards/${encodeURIComponent(handle)}`,
    );
    return parseOne(CardDetailSchema, card) as CardDetailData | null;
  } catch (error) {
    logger.error(`[cards] failed to load card '${handle}':`, error);
    return null;
  }
}
