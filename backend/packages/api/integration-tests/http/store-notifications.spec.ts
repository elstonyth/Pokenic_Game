// integration-tests/http/store-notifications.spec.ts
// TDD: RED first — route does not exist yet, so these tests fail with 404.
// Tests:
//   (positive)  GET /store/notifications as customer A → 200, returns A's row, id matches.
//   (IDOR)      A's response NEVER contains B's notification id.
//   (auth)      no bearer → 401.
import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { Modules } from '@medusajs/framework/utils';
import { unwrapResponse } from './utils';

jest.setTimeout(120 * 1000);

const PASSWORD = 'notif-test-password-1';

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('GET /store/notifications', () => {
      let storeHeaders: Record<string, string>;
      let tokenA: string;
      let customerIdA: string;
      let customerIdB: string;
      let notifIdA: string;

      beforeEach(async () => {
        const container = getContainer();

        // Publishable API key required for /store/* endpoints.
        const apiKeyModule = container.resolve(Modules.API_KEY);
        const key = await apiKeyModule.createApiKeys({
          title: 'notif-test',
          type: 'publishable',
          created_by: 'notif-test',
        });
        storeHeaders = { 'x-publishable-api-key': key.token };

        // Register + login customer A.
        const regA = await api.post('/auth/customer/emailpass/register', {
          email: 'notif-a@test.dev',
          password: PASSWORD,
        });
        await api.post(
          '/store/customers',
          { email: 'notif-a@test.dev' },
          {
            headers: {
              ...storeHeaders,
              authorization: `Bearer ${regA.data.token}`,
            },
          },
        );
        const loginA = await api.post('/auth/customer/emailpass', {
          email: 'notif-a@test.dev',
          password: PASSWORD,
        });
        tokenA = loginA.data.token;

        // Derive customer A's actor id from the token (base64 JWT payload).
        const payloadA = JSON.parse(
          Buffer.from(tokenA.split('.')[1], 'base64').toString('utf8'),
        );
        customerIdA = payloadA.actor_id as string;

        // Register customer B (we only need their id — no login needed).
        const regB = await api.post('/auth/customer/emailpass/register', {
          email: 'notif-b@test.dev',
          password: PASSWORD,
        });
        await api.post(
          '/store/customers',
          { email: 'notif-b@test.dev' },
          {
            headers: {
              ...storeHeaders,
              authorization: `Bearer ${regB.data.token}`,
            },
          },
        );
        const payloadB = JSON.parse(
          Buffer.from(regB.data.token.split('.')[1], 'base64').toString('utf8'),
        );
        customerIdB = payloadB.actor_id as string;

        // Seed one feed notification for A and one for B via the Notification Module.
        const notif = container.resolve(Modules.NOTIFICATION);
        const [rowA] = await notif.createNotifications([
          {
            to: customerIdA,
            receiver_id: customerIdA,
            channel: 'feed',
            template: 'vip_level_up',
            data: { level: 2, label: 'Silver I' },
          },
        ]);
        notifIdA = rowA.id;

        await notif.createNotifications([
          {
            to: customerIdB,
            receiver_id: customerIdB,
            channel: 'feed',
            template: 'commission_matured',
            data: { amount_usd: 5 },
          },
        ]);
      });

      const authed = (token: string) => ({
        ...storeHeaders,
        authorization: `Bearer ${token}`,
      });

      it('(auth) returns 401 when no bearer token is provided', async () => {
        const res = await unwrapResponse(
          api.get('/store/notifications', { headers: storeHeaders }),
        );
        expect(res.status).toBe(401);
      });

      it('(positive) returns A\'s own feed notification with correct shape', async () => {
        const res = await unwrapResponse(
          api.get('/store/notifications', { headers: authed(tokenA) }),
        );
        expect(res.status).toBe(200);

        const { notifications } = res.data as {
          notifications: Array<{
            id: string;
            template: string;
            data: Record<string, unknown>;
            created_at: string;
            read_at: string | null;
          }>;
        };

        // Must contain A's row.
        expect(notifications.some((n) => n.id === notifIdA)).toBe(true);

        // The returned row must have the expected shape.
        const rowA = notifications.find((n) => n.id === notifIdA)!;
        expect(rowA.template).toBe('vip_level_up');
        expect(rowA.data).toMatchObject({ level: 2, label: 'Silver I' });
        expect(typeof rowA.created_at).toBe('string');
        // read_at is null until Phase 5 mark-read is implemented.
        expect(rowA.read_at).toBeNull();
      });

      it('(IDOR) A\'s response never contains B\'s notification id', async () => {
        const res = await unwrapResponse(
          api.get('/store/notifications', { headers: authed(tokenA) }),
        );
        expect(res.status).toBe(200);

        const { notifications } = res.data as { notifications: Array<{ id: string }> };

        // Must contain A's own row (positive gate — a vacuously-empty list would pass the IDOR check).
        expect(notifications.some((n) => n.id === notifIdA)).toBe(true);

        // Must NOT contain any row scoped to B.
        // We do this by asserting that every returned row has A's receiver_id baked in.
        // The route owner-scopes by receiver_id from the token, so if B's row appeared
        // it would be the IDOR hole. Checking absence of notifIdA proves B's id is missing.
        // (notifIdA is A's id — B's id is a different value; we verify B's is excluded.)
        const container = getContainer();
        const notif = container.resolve(Modules.NOTIFICATION);
        // Fetch B's rows directly to get their ids.
        const bRows = await notif.listNotifications(
          { receiver_id: customerIdB, channel: 'feed' },
          { take: 10 },
        );
        const bIds = new Set(bRows.map((r: { id: string }) => r.id));
        const returnedIds = notifications.map((n) => n.id);
        for (const id of returnedIds) {
          expect(bIds.has(id)).toBe(false);
        }
      });

      it('mark-read: owner can mark own, read_at populates, idempotent, unread_count decrements', async () => {
        // GET list first to establish baseline unread_count.
        const listRes = await unwrapResponse(
          api.get('/store/notifications', { headers: authed(tokenA) }),
        );
        expect(listRes.status).toBe(200);
        const { notifications: beforeList, unread_count: beforeCount } = listRes.data as {
          notifications: Array<{ id: string; read_at: string | null }>;
          unread_count: number;
        };
        expect(beforeList.length).toBeGreaterThan(0);
        const id = beforeList[0].id;
        // Initially all unread.
        expect(beforeCount).toBe(beforeList.length);

        // Mark read.
        const markRes = await unwrapResponse(
          api.post(`/store/notifications/${id}/read`, {}, { headers: authed(tokenA) }),
        );
        expect(markRes.status).toBe(200);
        expect(markRes.data.id).toBe(id);
        expect(markRes.data.read_at).toBeTruthy();

        // Idempotent: second mark must not throw.
        const mark2Res = await unwrapResponse(
          api.post(`/store/notifications/${id}/read`, {}, { headers: authed(tokenA) }),
        );
        expect(mark2Res.status).toBe(200);
        expect(mark2Res.data.read_at).toBeTruthy();

        // GET after: read_at set on the row, unread_count decremented.
        const afterRes = await unwrapResponse(
          api.get('/store/notifications', { headers: authed(tokenA) }),
        );
        expect(afterRes.status).toBe(200);
        const { notifications: afterList, unread_count: afterCount } = afterRes.data as {
          notifications: Array<{ id: string; read_at: string | null }>;
          unread_count: number;
        };
        expect(afterList.find((n) => n.id === id)?.read_at).toBeTruthy();
        expect(afterCount).toBe(beforeCount - 1);
      });

      it('mark-read IDOR: A cannot mark B\'s notification → 404', async () => {
        // Get B's notification id directly from the module.
        const container = getContainer();
        const notif = container.resolve(Modules.NOTIFICATION);
        const bRows = await notif.listNotifications(
          { receiver_id: customerIdB, channel: 'feed' },
          { take: 1 },
        );
        expect(bRows.length).toBeGreaterThan(0);
        const bId = bRows[0].id;

        // A attempts to mark B's notification → must get 404 (no existence leak).
        const res = await unwrapResponse(
          api.post(`/store/notifications/${bId}/read`, {}, { headers: authed(tokenA) }),
        );
        expect(res.status).toBe(404);
      });

      it('mark-read (unauth): no bearer → 401', async () => {
        const res = await unwrapResponse(
          api.post(`/store/notifications/${notifIdA}/read`, {}, { headers: storeHeaders }),
        );
        expect(res.status).toBe(401);
      });
    });
  },
});
