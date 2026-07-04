import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../../../modules/packs';
import type PacksModuleService from '../../../../modules/packs/service';
import {
  collapseLadder,
  type VoucherRange,
} from '../../../../modules/packs/voucher-ranges';

// GET /admin/daily-rewards/vouchers — the 100-level voucher ladder plus its
// collapsed {from,to,amount_myr} ranges (what the range editor renders).
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const levels = await packs.getVoucherLadder();
  res.json({
    levels,
    ranges: collapseLadder(levels.map((l) => l.amount_myr)),
  });
}

// POST /admin/daily-rewards/vouchers — body { ranges, reason }. foldRanges
// (inside saveVoucherRanges) enforces full 1–100 coverage with no overlaps and
// throws plain Errors with human messages → mapped to 400 here. The write
// updates only changed vip_level rows and records ONE audit row. admin_id
// comes from auth_context — NEVER from the body.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const adminId = req.auth_context.actor_id;
  const { ranges, reason } = (req.body ?? {}) as {
    ranges?: VoucherRange[];
    reason?: string;
  };
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    res
      .status(400)
      .json({ message: 'A reason is required for the audit trail.' });
    return;
  }

  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  try {
    await packs.saveVoucherRanges(ranges ?? [], adminId, reason.trim());
  } catch (e) {
    if (e instanceof MedusaError) throw e;
    res.status(400).json({ message: (e as Error).message });
    return;
  }
  res.json({ ok: true });
}
