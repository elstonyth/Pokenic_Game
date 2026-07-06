import { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { rebakeAllGradedCards } from '../api/admin/media/bake-slab';

// Backfill/refresh EVERY graded card's baked slab composite.
//   npx medusa exec ./src/scripts/bake-slab-images.ts
// Manual prod step after this feature deploys (spec §H.2). Dev note: card
// image URLs are localhost static URLs — the backend dev server must be
// RUNNING or every bake fails (gracefully, to null).
export default async function bakeSlabImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const { ok, failed } = await rebakeAllGradedCards(container);
  logger.info(`bake-slab-images: ${ok} baked, ${failed} failed.`);
}
