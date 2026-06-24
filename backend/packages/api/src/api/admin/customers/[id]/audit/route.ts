import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../../../modules/packs';
import type PacksModuleService from '../../../../../modules/packs/service';

export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const { id } = req.params;
  const limit = Number(req.query.limit ?? 50);
  const offset = Number(req.query.offset ?? 0);
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  res.json(await packs.auditForCustomer(id, { limit, offset }));
}
