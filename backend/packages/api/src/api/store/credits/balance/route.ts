import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import PacksModuleService from '../../../../modules/packs/service';
import { PACKS_MODULE } from '../../../../modules/packs';

// GET /store/credits/balance — the bare number for hot callers (header chip,
// vault page). The full wallet/ledger view stays on GET /store/credits.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  res.json({ balance: await packs.creditBalance(req.auth_context.actor_id) });
}
