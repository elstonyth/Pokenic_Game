import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

// #5 — the showcase toggle must only ever stamp `showcased` onto a still-vaulted
// pull. The write is a status-filtered update (WHERE status = 'vaulted'), so a
// sell/deliver that flips the pull's status can't leave the flag set on a card
// that's no longer in the vault. These cover the happy path (the filtered update
// actually toggles) and the refusal path (a sold pull is rejected, flag stays).

const PASSWORD = 'showcase-test-password-1';
const PACK_SLUG = 'showcase-pack';
const CARD_HANDLE = 'showcase-card';
const PACK_PRICE = 10;
const FMV = 50;

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('showcase toggle (vaulted-only)', () => {
      let storeHeaders: Record<string, string>;

      beforeEach(async () => {
        const container = getContainer();
        const apiKeyModule = container.resolve(Modules.API_KEY);
        const key = await apiKeyModule.createApiKeys({
          title: 'showcase-test',
          type: 'publishable',
          created_by: 'showcase-test',
        });
        storeHeaders = { 'x-publishable-api-key': key.token };

        const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
        await packs.createPacks([
          {
            slug: PACK_SLUG,
            title: 'Showcase Test Pack',
            category: 'pokemon',
            price: PACK_PRICE,
            image: '/cdn/test-pack.webp',
            buyback_percent: 90,
          },
        ]);
        await packs.createCards([
          {
            handle: CARD_HANDLE,
            name: 'Showcase Test Card PSA 10',
            set: 'Test Set',
            grader: 'PSA',
            grade: '10',
            market_value: FMV,
            image: '/cdn/test-card.webp',
          },
        ]);
        await packs.createPackOdds([
          {
            pack_id: PACK_SLUG,
            card_id: CARD_HANDLE,
            weight: 100,
            locked: false,
            rarity: 'Rare' as const,
          },
        ]);

        const productModule = container.resolve(Modules.PRODUCT);
        const [product] = await productModule.createProducts([
          {
            title: 'Showcase Test Card PSA 10',
            handle: CARD_HANDLE,
            status: 'published',
            options: [{ title: 'Format', values: ['Slab'] }],
            variants: [
              {
                title: 'Slab',
                sku: `CARD-${CARD_HANDLE.toUpperCase()}`,
                manage_inventory: true,
                options: { Format: 'Slab' },
              },
            ],
          },
        ]);
        const stockLocationModule = container.resolve(Modules.STOCK_LOCATION);
        const location = await stockLocationModule.createStockLocations({
          name: 'Showcase Test Warehouse',
        });
        const inventoryModule = container.resolve(Modules.INVENTORY);
        const item = await inventoryModule.createInventoryItems({
          sku: `CARD-${CARD_HANDLE.toUpperCase()}`,
        });
        await inventoryModule.createInventoryLevels([
          {
            inventory_item_id: item.id,
            location_id: location.id,
            stocked_quantity: 5,
          },
        ]);
        const link = container.resolve(ContainerRegistrationKeys.LINK);
        await link.create({
          [Modules.PRODUCT]: { variant_id: product.variants[0].id },
          [Modules.INVENTORY]: { inventory_item_id: item.id },
        });
      });

      const authed = (token: string): Record<string, string> => ({
        ...storeHeaders,
        authorization: `Bearer ${token}`,
      });

      const registerCustomer = async (email: string): Promise<string> => {
        const reg = await api.post('/auth/customer/emailpass/register', {
          email,
          password: PASSWORD,
        });
        await api.post(
          '/store/customers',
          { email },
          {
            headers: {
              ...storeHeaders,
              authorization: `Bearer ${reg.data.token}`,
            },
          },
        );
        const login = await api.post('/auth/customer/emailpass', {
          email,
          password: PASSWORD,
        });
        return login.data.token;
      };

      const openOne = async (token: string): Promise<string> => {
        await unwrapResponse(
          api.post(
            '/store/credits/topup',
            { amount: PACK_PRICE },
            { headers: authed(token) },
          ),
        );
        const opened = await unwrapResponse(
          api.post(
            `/store/packs/${PACK_SLUG}/open`,
            {},
            { headers: authed(token) },
          ),
        );
        return opened.data.pull.id as string;
      };

      const showcase = (pullId: string, showcased: boolean, token: string) =>
        unwrapResponse(
          api.post(
            `/store/vault/${pullId}/showcase`,
            { showcased },
            { headers: authed(token) },
          ),
        );

      const pullRow = async (pullId: string) => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const [row] = await packs.listPulls({ id: pullId }, { take: 1 });
        return row as unknown as { status: string; showcased: boolean };
      };

      it('showcases a vaulted pull (filtered update toggles the flag)', async () => {
        const token = await registerCustomer('showcase-a@test.dev');
        const pullId = await openOne(token);

        const res = await showcase(pullId, true, token);
        expect(res.status).toBe(200);
        expect(res.data).toMatchObject({ pull_id: pullId, showcased: true });
        expect(await pullRow(pullId)).toMatchObject({
          status: 'vaulted',
          showcased: true,
        });
      });

      it('refuses to showcase a sold pull and never sets the flag', async () => {
        const token = await registerCustomer('showcase-b@test.dev');
        const pullId = await openOne(token);

        const sold = await unwrapResponse(
          api.post(
            `/store/vault/${pullId}/buyback`,
            {},
            { headers: authed(token) },
          ),
        );
        expect(sold.status).toBe(200);

        const res = await showcase(pullId, true, token);
        expect(res.status).toBe(400);

        const row = await pullRow(pullId);
        expect(row.status).toBe('bought_back');
        expect(row.showcased).toBe(false);
      });
    });
  },
});
