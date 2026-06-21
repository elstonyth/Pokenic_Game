import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';

type Body = { sponsor_id?: unknown };

// POST /store/referral — the recruit sets their sponsor. recruitId is the
// verified token actor (NEVER the body); sponsor_id is the body. linkSponsor
// enforces self-referral / cycle / immutability under a dual-id lock.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const recruitId = req.auth_context.actor_id;
  const sponsorId = (req.body as Body)?.sponsor_id;
  if (typeof sponsorId !== 'string' || sponsorId.length === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'sponsor_id is required.',
    );
  }

  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const { id } = await packs.linkSponsor({ recruitId, sponsorId });
  res.status(201).json({ id });
}
