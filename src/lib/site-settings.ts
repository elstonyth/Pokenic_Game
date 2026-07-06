import { sdk } from './medusa';
import { logger } from '@/lib/logger';

/** Bundled fallback frame (also the default until an admin uploads one). */
export const DEFAULT_SLAB_FRAME = '/images/slab-frame.webp';

// Admin-configurable slab-frame overlay URL, cached for a few minutes and
// shared across all server renders (same pattern + rationale as the FX-rate
// cache in data/products.ts: picks up an admin change within a bounded delay,
// never blocks a page on a transient backend outage; a miss/failure clears
// the cache so the next render retries).
const CACHE_TTL_MS = 5 * 60 * 1000;
let framePromise: Promise<string> | null = null;
let frameCachedAt = 0;

export function getSlabFrameUrl(): Promise<string> {
  if (!framePromise || Date.now() - frameCachedAt > CACHE_TTL_MS) {
    frameCachedAt = Date.now();
    framePromise = sdk.client
      .fetch<{ slab_frame_url: string | null }>('/store/site-settings')
      .then((data) => data.slab_frame_url || DEFAULT_SLAB_FRAME)
      .catch((error) => {
        framePromise = null;
        logger.error('[site-settings] failed to load slab frame URL:', error);
        return DEFAULT_SLAB_FRAME;
      });
  }
  return framePromise;
}
