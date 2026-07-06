/**
 * Avatar-frame catalog seam — the public milestone-frame map (level → image
 * URL) the storefront overlays on profile photos. Server-only like the other
 * data getters; failures degrade to {} (avatars render frameless).
 */
import 'server-only';
import { cache } from 'react';
import { sdk } from '@/lib/medusa';
import { logger } from '@/lib/logger';
import { parseOne, AvatarFramesSchema } from '@/lib/data/schemas';

export const getAvatarFrames = cache(
  async (): Promise<Record<string, string>> => {
    try {
      const parsed = parseOne(
        AvatarFramesSchema,
        await sdk.client.fetch('/store/avatar-frames', { cache: 'no-store' }),
      );
      return parsed ? parsed.frames : {};
    } catch (error) {
      logger.error('[avatar-frames] catalog load failed:', error);
      return {};
    }
  },
);
