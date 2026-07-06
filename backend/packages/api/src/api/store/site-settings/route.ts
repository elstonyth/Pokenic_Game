import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';

// GET /store/site-settings — storefront presentation config (currently just
// the slab-frame overlay URL). Public, read-only, no customer auth (display
// chrome carries no PII) — same stance as /store/pricing/fx.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  // Slab frame only — the avatar-frame catalog is served by
  // /store/avatar-frames, not duplicated here.
  const { slab_frame_url } = await packs.siteSettings();
  res.json({ slab_frame_url });
}
