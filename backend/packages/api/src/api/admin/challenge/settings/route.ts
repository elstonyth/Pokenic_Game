import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../../modules/packs';
import type PacksModuleService from '../../../../modules/packs/service';
import { validateChallengeSettingsPatch } from '../../../../modules/packs/challenge-validate';
import { reqReason } from '../../rewards-settings/validate';

// GET /admin/challenge/settings — the singleton or §4.1 defaults (never 404s).
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  res.json(await packs.challengeSettings());
}

// POST /admin/challenge/settings — audited singleton patch.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const adminId = req.auth_context.actor_id;
  const reason = reqReason(req.body);
  const patch = validateChallengeSettingsPatch(req.body);
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const saved = await packs.editChallengeSettings({ patch, adminId, reason });
  res.json(saved);
}
