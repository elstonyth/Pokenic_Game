import { MedusaError } from '@medusajs/framework/utils';

// The 10 frame milestones — one frame per 10 levels, L1-9 have none (workbook
// '^' marks; mirrored by vip_level.frame_unlock = L % 10 === 0).
export const FRAME_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;

// POST /admin/avatar-frames body → validated catalog. Only milestone-level
// keys; each value a same-origin path or explicit http(s) URL ≤ 2048 chars
// (same shape rule as the slab frame's reqSlabFrameUrl). null/absent values
// clear that level's frame.
export function validateAvatarFrames(raw: unknown): Record<string, string> {
  const body = (raw as { frames?: unknown } | null)?.frames;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'frames must be an object keyed by milestone level.',
    );
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const level = Number(key);
    if (!(FRAME_LEVELS as readonly number[]).includes(level)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `frames key '${key}' is not a milestone level (10, 20, … 100).`,
      );
    }
    if (value === null || value === undefined) continue;
    const url = typeof value === 'string' ? value.trim() : '';
    const okShape =
      url.length > 0 &&
      url.length <= 2048 &&
      ((url.startsWith('/') && !url.startsWith('//')) ||
        url.startsWith('http://') ||
        url.startsWith('https://'));
    if (!okShape) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `frames['${key}'] must be a path or http(s) URL (≤ 2048 chars).`,
      );
    }
    out[String(level)] = url;
  }
  return out;
}
