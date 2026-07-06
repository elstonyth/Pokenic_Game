import { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import { updateProductsWorkflow } from '@medusajs/medusa/core-flows';
import { PACKS_MODULE } from '../modules/packs';
import type PacksModuleService from '../modules/packs/service';
import { resolvePcImageUrl } from '../api/admin/pricecharting/product-image';
import { ingestPcImage } from '../api/admin/media/ingest-pc-image';
import { pcFetch } from '../api/admin/pricecharting/client';

// repull-pc-images — replace EVERY catalog image with a freshly ingested copy
// of its PriceCharting product photo, through the SAME seam "Add from
// PriceCharting" uses (photo scrape → validated media ingest → our own stored
// copy, never a hotlink).
//
// Coverage, in order:
//   1. ALL Medusa products: pc id from metadata.pc_product_id, else found via
//      the PriceCharting search API using the product title (grade suffix
//      stripped — PC names carry no grade). A search hit is written back to
//      metadata.pc_product_id so the next run resolves directly. Updates
//      product thumbnail + images, and the same-handle gacha Card when one
//      exists.
//   2. Gacha cards with a pc_product_id whose handle had no product above.
//
// A row whose photo can't be matched/resolved/ingested KEEPS its current
// image and is listed at the end (the log shows the searched-for title next
// to the matched PC name — audit it for mismatches). Sequential on purpose
// (polite to PC); repeated pc_product_ids ingest once. Idempotent, safe to
// re-run.
//
// Needs PRICECHARTING_API_TOKEN in the backend .env for the search fallback;
// metadata-linked rows work without it.
//
// Run:  corepack yarn medusa exec ./src/scripts/repull-pc-images.ts
//       … ./src/scripts/repull-pc-images.ts --only <product-or-card-handle>

type PcSearchResponse = {
  status: string;
  'error-message'?: string;
  products?: Array<{
    id: string | number;
    'product-name'?: string;
    'console-name'?: string;
  }>;
};

// "… Holo Espathra #081 CGC 8.5 NM-MT+" → "… Holo Espathra #081"
const searchQuery = (title: string): string =>
  title.replace(/\s+(PSA|CGC|BGS|SGC|TAG|ACE)\s.*$/i, '').trim();

export default async function repullPcImages({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
  const productModule = container.resolve(Modules.PRODUCT);

  const onlyIdx = args?.indexOf('--only') ?? -1;
  const only = onlyIdx >= 0 ? args?.[onlyIdx + 1] : undefined;

  // pc_product_id → stored URL (grades of one card share a PC product).
  const storedByPcId = new Map<string, string>();
  const resolveStored = async (pcId: string): Promise<string> => {
    let stored = storedByPcId.get(pcId);
    if (!stored) {
      const pcUrl = await resolvePcImageUrl(pcId);
      if (!pcUrl) {
        throw new Error('no photo found on the PriceCharting offers page');
      }
      stored = await ingestPcImage(container, pcUrl);
      storedByPcId.set(pcId, stored);
    }
    return stored;
  };

  const searchPcId = async (
    title: string,
  ): Promise<{ id: string; matched: string } | null> => {
    const q = searchQuery(title);
    const result = await pcFetch<PcSearchResponse>('/api/products', { q });
    if (result.kind === 'no-token') {
      throw new Error(
        'PRICECHARTING_API_TOKEN missing — cannot search unlinked products',
      );
    }
    if (result.kind === 'error') throw new Error(result.message);
    const first = result.data.products?.[0];
    if (!first) return null;
    return {
      id: String(first.id),
      matched:
        `${first['console-name'] ?? ''} ${first['product-name'] ?? ''}`.trim(),
    };
  };

  const allCards = await packs.listCards({}, { take: 1000 });
  const cardByHandle = new Map(allCards.map((c) => [c.handle, c]));

  let replaced = 0;
  const kept: string[] = [];

  // ---- 1. The whole marketplace catalog -----------------------------------
  const products = await productModule.listProducts(
    only ? { handle: only } : {},
    { take: 1000 },
  );
  logger.info(
    `repull-pc-images: ${products.length} product(s)${only ? ` (--only ${only})` : ''}, ${allCards.length} gacha card(s).`,
  );

  const doneHandles = new Set<string>();
  for (const product of products) {
    const label = product.handle ?? product.id;
    try {
      let pcId =
        typeof product.metadata?.pc_product_id === 'string'
          ? product.metadata.pc_product_id
          : product.metadata?.pc_product_id != null
            ? String(product.metadata.pc_product_id)
            : null;
      let matchedName: string | null = null;
      if (!pcId) {
        const hit = await searchPcId(product.title ?? '');
        if (!hit) throw new Error('no PriceCharting search match');
        pcId = hit.id;
        matchedName = hit.matched;
      }
      const stored = await resolveStored(pcId);
      await updateProductsWorkflow(container).run({
        input: {
          products: [
            {
              id: product.id,
              thumbnail: stored,
              images: [{ url: stored }],
              // Merge, never clobber: metadata carries fmv/points/grade etc.
              metadata: { ...product.metadata, pc_product_id: pcId },
            },
          ],
        },
      });
      const card = product.handle ? cardByHandle.get(product.handle) : null;
      if (card) {
        await packs.updateCards([{ id: card.id, image: stored }]);
        doneHandles.add(card.handle);
      }
      replaced++;
      logger.info(
        `✓ ${label} ← pc:${pcId}${matchedName ? ` (matched "${matchedName}")` : ''}`,
      );
    } catch (e) {
      kept.push(label);
      logger.warn(
        `✗ ${label}: ${e instanceof Error ? e.message : String(e)} — kept existing image`,
      );
    }
  }

  // ---- 2. PC-linked gacha cards not covered by a product above ------------
  for (const card of allCards) {
    if (doneHandles.has(card.handle) || !card.pc_product_id) continue;
    if (only && card.handle !== only) continue;
    try {
      const stored = await resolveStored(String(card.pc_product_id));
      await packs.updateCards([{ id: card.id, image: stored }]);
      replaced++;
      logger.info(`✓ card ${card.handle} ← pc:${card.pc_product_id}`);
    } catch (e) {
      kept.push(`card:${card.handle}`);
      logger.warn(
        `✗ card ${card.handle}: ${e instanceof Error ? e.message : String(e)} — kept existing image`,
      );
    }
  }

  logger.info(
    `repull-pc-images done: ${replaced} image(s) replaced, ${kept.length} kept.${kept.length ? ` Kept: ${kept.join(', ')}` : ''}`,
  );
}
