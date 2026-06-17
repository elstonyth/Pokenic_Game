import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import PacksModuleService from '../../../../modules/packs/service';
import { PACKS_MODULE } from '../../../../modules/packs';
import { serializeDeliveryOrders } from '../../../../modules/packs/delivery-view';

// GET /store/delivery-orders/:id — one order the caller owns.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const { id } = req.params;
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);

  const [order] = await packs.listDeliveryOrders({ id }, { take: 1 });
  // Unknown id and foreign order both 404 — no cross-account leak.
  if (!order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Order not found.');
  }

  const [serialized] = await serializeDeliveryOrders(packs, [order]);
  res.json({ order: serialized });
}
