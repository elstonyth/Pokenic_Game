import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../../../../modules/packs';
import type PacksModuleService from '../../../../../modules/packs/service';

type Body = { reason?: unknown };

// POST /admin/commissions/:id/reverse — commission-scoped clawback (all gens
// for the open; recruit charge untouched). admin_id from the verified session.
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
  const result = await packs.reverseCommission({
    commissionId,
    adminId,
    reason: reason.trim(),
  });
  res.json(result);
}
