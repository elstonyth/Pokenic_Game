import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';
import { validateAvatarFrames } from '../../../modules/packs/avatar-frames';
import { reqReason } from '../rewards-settings/validate';

// GET /admin/avatar-frames — current catalog for the Frames tab.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const { avatar_frames } = await packs.siteSettings();
  res.json({ frames: avatar_frames });
}

// POST /admin/avatar-frames — audited replace of the whole catalog. admin_id
// derives from the verified auth_context (NEVER the body). /admin/* is
// framework-auto-protected.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const adminId = req.auth_context.actor_id;
  const reason = reqReason(req.body);
  const frames = validateAvatarFrames(req.body);
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const { avatar_frames } = await packs.editAvatarFrames({
    frames,
    adminId,
    reason,
  });
  res.json({ frames: avatar_frames });
}
