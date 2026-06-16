import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { MedusaError, Modules } from '@medusajs/framework/utils';
import PacksModuleService from '../../../../../modules/packs/service';
import { PACKS_MODULE } from '../../../../../modules/packs';
import { snapshotAddress } from '../../../../../modules/packs/delivery';

// POST /store/delivery-orders/:id/address — re-snapshot the shipping address
// from the caller's address book, allowed while requested|packing only.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const { id } = req.params;
  const body = req.body as { address_id?: unknown } | undefined;
  const addressId = body?.address_id;
  if (typeof addressId !== 'string' || addressId.trim() === '') {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      '`address_id` (string) is required.',
    );
  }

  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const [order] = await packs.listDeliveryOrders({ id }, { take: 1 });
  if (!order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, 'Order not found.');
  }
  if (order.status !== 'requested' && order.status !== 'packing') {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      'This order has already shipped — its address is locked.',
    );
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER);
  const [address] = await customerModule.listCustomerAddresses(
    { id: addressId, customer_id: customerId },
    { take: 1 },
  );
  if (!address) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      'Shipping address not found.',
    );
  }
  const snapshot = snapshotAddress(address);
  if (!snapshot) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'That address is missing required shipping fields.',
    );
  }

  await packs.updateDeliveryOrders([{ id: order.id, ...snapshot }]);
  res.json({ order_id: order.id, address: snapshot });
}
