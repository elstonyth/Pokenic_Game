import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../../../../modules/packs';
import type PacksModuleService from '../../../../../modules/packs/service';
import { saveDailyBoxWorkflow } from '../../../../../workflows/save-daily-box';

// GET /admin/daily-rewards/boxes/:tier — the per-tier box editor read: box
// config + every prize row INCLUDING locked/pct. Authoring-only — this shape
// must never be reused for a store-facing response. Unknown tier → 404 (the
// service throws MedusaError NOT_FOUND).
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  res.json(await packs.getDailyBoxEditor(req.params.tier));
}

// POST /admin/daily-rewards/boxes/:tier — replace-all authoring write via
// saveDailyBoxWorkflow (validate + fold odds outside the transaction, then the
// atomic prize-table replace + audit row). admin_id comes from auth_context —
// NEVER from the body. validateDailyBox/computeBoxWeights throw plain Errors
// with human messages → mapped to 400 here; MedusaErrors (e.g. unknown tier →
// NOT_FOUND) keep their framework status mapping.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const adminId = req.auth_context.actor_id;

  try {
    const { result } = await saveDailyBoxWorkflow(req.scope).run({
      input: { tier: req.params.tier, body: req.body, admin_id: adminId },
    });
    res.json(result);
  } catch (e) {
    if (e instanceof MedusaError) throw e;
    res.status(400).json({ message: (e as Error).message });
  }
}
