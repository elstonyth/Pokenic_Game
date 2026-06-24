import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { Modules } from '@medusajs/framework/utils';
import type { INotificationModuleService } from '@medusajs/framework/types';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';

// GET /store/notifications — the authenticated customer's own in-app feed.
//
// Owner-scoping: receiver_id is derived ONLY from the verified bearer token
// (req.auth_context.actor_id). It is NEVER read from the query string or body,
// so one customer cannot list another customer's notifications (IDOR prevention).
//
// Auth + rate-limit middleware is registered in src/api/middlewares.ts.
//
// read_at: sourced from the notification_read packs side-table (Task 1).
// Rows that have no entry in that table are returned with read_at: null.
//
// unread_count: page-scoped count of rows in the returned page whose read_at is
// null (limited to RECENT_NOTIFICATIONS items), NOT the total unread across all
// notifications for this customer.
//
// Most-recent feed page size (mirrors RECENT_TRANSACTIONS in store/credits).
const RECENT_NOTIFICATIONS = 50;

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const receiverId = req.auth_context.actor_id;

  const notif = req.scope.resolve<INotificationModuleService>(
    Modules.NOTIFICATION,
  );

  const notifications = await notif.listNotifications(
    { receiver_id: receiverId, channel: 'feed' },
    { take: RECENT_NOTIFICATIONS, order: { created_at: 'DESC' } },
  );

  // Batch-fetch read state for this page from the packs side-table.
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const notifIds = notifications.map((n) => n.id);
  const reads =
    notifIds.length > 0
      ? await packs.listNotificationReads(
          { customer_id: receiverId, notification_id: notifIds },
          { take: notifIds.length },
        )
      : [];
  const readAtById = new Map(
    reads.map((r: { notification_id: string; read_at: Date | null }) => [
      r.notification_id,
      r.read_at,
    ]),
  );

  const mapped = notifications.map((n) => ({
    id: n.id,
    template: n.template,
    data: n.data,
    created_at: n.created_at,
    read_at: readAtById.get(n.id) ?? null,
  }));

  res.json({
    notifications: mapped,
    unread_count: mapped.filter((n) => !n.read_at).length,
  });
}
