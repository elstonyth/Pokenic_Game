import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import {
  ContainerRegistrationKeys,
  MedusaError,
} from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';
import { reqReason } from '../rewards-settings/validate';
import { rebakeAllGradedCards } from '../media/bake-slab';

// GET /admin/site-settings — current storefront presentation config.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  res.json(await packs.siteSettings());
}

// slab_frame_url: null resets to the storefront's bundled default; otherwise
// a same-origin path ('/...') or an absolute http(s) URL (the /admin/media
// upload returns one), ≤ 2048 chars.
function reqSlabFrameUrl(body: unknown): string | null {
  const value = (body as Record<string, unknown> | null)?.slab_frame_url;
  if (value === null) return null;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (
    trimmed.length > 0 &&
    trimmed.length <= 2048 &&
    // '//' would be protocol-relative (an off-origin URL in disguise) — only
    // true same-origin paths and explicit http(s) URLs pass.
    ((trimmed.startsWith('/') && !trimmed.startsWith('//')) ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://'))
  ) {
    return trimmed;
  }
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    'slab_frame_url must be null or a path/http(s) URL (≤ 2048 chars).',
  );
}

// POST /admin/site-settings — audited edit. admin_id derives from the verified
// auth_context (NEVER the body). Admin routes are framework-auto-protected.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const adminId = req.auth_context.actor_id;
  const reason = reqReason(req.body);
  const slabFrameUrl = reqSlabFrameUrl(req.body);
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const settings = await packs.editSiteSettings({
    slabFrameUrl,
    adminId,
    reason,
  });
  // The frame changed → every graded card's composite is stale. Re-bake them
  // all in-request (spec §C; sync by decision #5 — seconds at today's ~17
  // cards, per-card failures don't stop the loop and land in `failed`).
  // The settings save above already committed — a bake-infrastructure failure
  // (frame resolve / card listing) must not surface as a save failure, so the
  // rebake is isolated; stale composites recover via a re-save or the
  // backfill script.
  let rebaked = { ok: 0, failed: 0 };
  try {
    rebaked = await rebakeAllGradedCards(req.scope);
  } catch (e) {
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `site-settings: rebake after frame swap failed: ${e instanceof Error ? e.message : String(e)}`,
      );
  }
  res.json({ ...settings, rebaked });
}
