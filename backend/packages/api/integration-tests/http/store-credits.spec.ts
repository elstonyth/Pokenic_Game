// integration-tests/http/store-credits.spec.ts
// TDD: RED first — GET /store/credits does not yet return a wallet block.
// Tests:
//   (wallet)  GET /store/credits returns a wallet block with the right shape.
//   (compat)  existing top-level balance/topup_total/spend_total/transactions untouched.
//   (auth)    no bearer → 401.
import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { Modules } from '@medusajs/framework/utils';
import { unwrapResponse } from './utils';

jest.setTimeout(120 * 1000);

const PASSWORD = 'store-credits-test-pw-1';

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('GET /store/credits wallet block', () => {
      let storeHeaders: Record<string, string>;
      let customerToken: string;

      beforeEach(async () => {
        const container = getContainer();

        // Publishable API key required for /store/* endpoints.
        const apiKeyModule = container.resolve(Modules.API_KEY);
        const key = await apiKeyModule.createApiKeys({
          title: 'store-credits-test',
          type: 'publishable',
          created_by: 'store-credits-test',
        });
        storeHeaders = { 'x-publishable-api-key': key.token };

        // Register + login a customer.
        const reg = await api.post('/auth/customer/emailpass/register', {
          email: 'sc-wallet-a@test.dev',
          password: PASSWORD,
        });
        await api.post(
          '/store/customers',
          { email: 'sc-wallet-a@test.dev' },
          {
            headers: {
              ...storeHeaders,
              authorization: `Bearer ${reg.data.token}`,
            },
          },
        );
        const login = await api.post('/auth/customer/emailpass', {
          email: 'sc-wallet-a@test.dev',
          password: PASSWORD,
        });
        customerToken = login.data.token;
      });

      const authed = (token: string): Record<string, string> => ({
        ...storeHeaders,
        authorization: `Bearer ${token}`,
      });

      it('(auth) returns 401 when no bearer token is provided', async () => {
        const res = await unwrapResponse(
          api.get('/store/credits', { headers: storeHeaders }),
        );
        expect(res.status).toBe(401);
      });

      it('GET /store/credits returns a wallet block', async () => {
        const res = await unwrapResponse(
          api.get('/store/credits', { headers: authed(customerToken) }),
        );
        expect(res.status).toBe(200);
        // wallet block must exist with the right shape
        expect(res.data.wallet).toMatchObject({
          balance: expect.any(Number),
          available: expect.any(Number),
          locked: expect.any(Number),
          is_frozen: false,
        });
        // next_unlock is either null or { amount: Number, date: string }
        expect(
          res.data.wallet.next_unlock === null ||
          (typeof res.data.wallet.next_unlock === 'object' &&
            typeof res.data.wallet.next_unlock.amount === 'number' &&
            typeof res.data.wallet.next_unlock.date === 'string'),
        ).toBe(true);
        // backward-compat: top-level balance is unchanged and matches wallet.balance
        expect(res.data.balance).toBe(res.data.wallet.balance);
      });

      it('(compat) existing top-level fields are untouched', async () => {
        const res = await unwrapResponse(
          api.get('/store/credits', { headers: authed(customerToken) }),
        );
        expect(res.status).toBe(200);
        // All pre-existing fields must still be present
        expect(typeof res.data.balance).toBe('number');
        expect(typeof res.data.topup_total).toBe('number');
        expect(typeof res.data.spend_total).toBe('number');
        expect(Array.isArray(res.data.transactions)).toBe(true);
      });
    });
  },
});
