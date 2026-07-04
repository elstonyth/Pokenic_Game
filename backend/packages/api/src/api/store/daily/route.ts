import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';

// GET /store/daily — the logged-in customer's consolidated daily-rewards state
// (box + voucher grants + shippable prizes) in one read: getDailyState().
//
// NOT gated (mirrors the old GET /store/rewards): the response carries
// redemption_enabled so the UI can pre-disable the Draw button before ever
// hitting the 403 on POST /store/daily/draw. The service never returns
// weight/locked/odds fields — showcase prizes are UNLOCKED rows only.
//
// AUTH + RATE LIMIT: registered in api/middlewares.ts (authenticate() then the
// store-read limiter). The customer id comes ONLY from the verified bearer token.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context?.actor_id;
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, 'Unauthorized');
  }

  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  // req.scope is passed so product-prize display can resolve Modules.PRODUCT.
  res.json(await packs.getDailyState(customerId, req.scope));
}
