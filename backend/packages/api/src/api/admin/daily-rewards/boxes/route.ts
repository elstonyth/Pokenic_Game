import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../../modules/packs';
import type PacksModuleService from '../../../../modules/packs/service';

// GET /admin/daily-rewards/boxes — every reward_box tier with prize/customer
// counts and the VIP level range each tier serves. Read-only listing for the
// Daily Rewards admin tab. Auth is the framework default /admin guard.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  res.json({ boxes: await packs.listDailyBoxesWithMeta() });
}
