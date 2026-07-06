import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';

// GET /store/avatar-frames — the public avatar-frame catalog (milestone level
// → image URL). Display chrome, no PII — same public stance as
// /store/site-settings.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const { avatar_frames } = await packs.siteSettings();
  res.json({ frames: avatar_frames });
}
