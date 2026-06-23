import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../../../../modules/packs';
import type PacksModuleService from '../../../../../modules/packs/service';

type Body = { reason?: unknown };

// POST /admin/commissions/:id/suspend — mark the commission suspended so it is
// excluded from available_balance until unsuspended or reversed.
// admin_id is derived from the verified auth_context (NEVER from the body).
// Admin routes are framework-auto-protected — no authenticate() middleware needed.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const commissionId = req.params.id;
  const adminId = req.auth_context.actor_id;
  const reason = (req.body as Body)?.reason;
  if (
    typeof reason !== 'string' ||
    reason.trim() === '' ||
    reason.trim().length > 500
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'A reason (1–500 chars) is required.',
    );
  }
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const result = await packs.suspendCommission({
    commissionId,
    adminId,
    reason: reason.trim(),
  });
  res.json(result);
}
