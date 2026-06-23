import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../../../../modules/packs';
import type PacksModuleService from '../../../../../modules/packs/service';

type Body = { reason?: unknown };

// POST /admin/commissions/:id/unsuspend — restore a suspended commission.
// Status is recomputed from matures_at rather than stored prior value, so a
// commission that matured while suspended comes back as available.
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
  const result = await packs.unsuspendCommission({
    commissionId,
    adminId,
    reason: reason.trim(),
  });
  res.json(result);
}
