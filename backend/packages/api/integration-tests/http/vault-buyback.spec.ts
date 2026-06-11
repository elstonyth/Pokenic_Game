import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../src/modules/packs";
import type PacksModuleService from "../../src/modules/packs/service";

jest.setTimeout(240 * 1000);

const PASSWORD = "vb-test-password-1";

// Fixture constants — FMV 50: the INSTANT rate (80%) must credit exactly 40.00
// inside the post-pull window; the VAULT rate (60%) credits 30.00 once the
// pull is older than the window (default 10 min — see buyback-rate.ts).
const PACK_SLUG = "vb-pack";
const CARD_HANDLE = "vb-card";
const FMV = 50;
const INSTANT_PERCENT = 80;
const INSTANT_AMOUNT = 40;
const VAULT_PERCENT = 60;
const VAULT_AMOUNT = 30;
const STOCKED = 5;

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe("vault → buyback loop", () => {
      let storeHeaders: Record<string, string>;
      let inventoryItemId: string;
      let stockLocationId: string;

      // The runner resets the database between `it` blocks, so the publishable
      // key, the gacha fixtures, and any customers are recreated per test.
      beforeEach(async () => {
        const container = getContainer();

        const apiKeyModule = container.resolve(Modules.API_KEY);
        const key = await apiKeyModule.createApiKeys({
          title: "vault-buyback-test",
          type: "publishable",
          created_by: "vault-buyback-test",
        });
        storeHeaders = { "x-publishable-api-key": key.token };

        // Gacha fixtures: an active pack with a SINGLE-card pool, so the
        // weighted roll is deterministic (the only card always wins).
        const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
        await packs.createPacks([
          {
            slug: PACK_SLUG,
            title: "VB Test Pack",
            category: "pokemon",
            price: 10,
            image: "/cdn/test-pack.webp",
            buyback_percent: INSTANT_PERCENT,
            vault_buyback_percent: VAULT_PERCENT,
          },
        ]);
        await packs.createCards([
          {
            handle: CARD_HANDLE,
            name: "VB Test Card PSA 10",
            set: "Test Set",
            grader: "PSA",
            grade: "10",
            market_value: FMV,
            image: "/cdn/test-card.webp",
          },
        ]);
        await packs.createPackOdds([
          {
            pack_id: PACK_SLUG,
            card_id: CARD_HANDLE,
            weight: 100,
            locked: false,
            rarity: "Rare" as const,
          },
        ]);

        // Tracked physical inventory for the card's product (handle is the
        // shared business key): product variant → (link) → inventory item →
        // location level. Built from plain modules + the link module — the
        // exact traversal card-stock.ts queries.
        const productModule = container.resolve(Modules.PRODUCT);
        const [product] = await productModule.createProducts([
          {
            title: "VB Test Card PSA 10",
            handle: CARD_HANDLE,
            status: "published",
            options: [{ title: "Format", values: ["Slab"] }],
            variants: [
              {
                title: "Slab",
                sku: `CARD-${CARD_HANDLE.toUpperCase()}`,
                manage_inventory: true,
                options: { Format: "Slab" },
              },
            ],
          },
        ]);
        const variantId = product.variants[0].id;

        const stockLocationModule = container.resolve(Modules.STOCK_LOCATION);
        const location = await stockLocationModule.createStockLocations({
          name: "VB Test Warehouse",
        });
        stockLocationId = location.id;

        const inventoryModule = container.resolve(Modules.INVENTORY);
        const item = await inventoryModule.createInventoryItems({
          sku: `CARD-${CARD_HANDLE.toUpperCase()}`,
        });
        inventoryItemId = item.id;
        await inventoryModule.createInventoryLevels([
          {
            inventory_item_id: inventoryItemId,
            location_id: stockLocationId,
            stocked_quantity: STOCKED,
          },
        ]);

        const link = container.resolve(ContainerRegistrationKeys.LINK);
        await link.create({
          [Modules.PRODUCT]: { variant_id: variantId },
          [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
        });
      });

      const stockedQuantity = async (): Promise<number> => {
        const inventoryModule = getContainer().resolve(Modules.INVENTORY);
        const [level] = await inventoryModule.listInventoryLevels({
          inventory_item_id: inventoryItemId,
        });
        return Number(level.stocked_quantity);
      };

      // Returns the axios response for both 2xx and error statuses.
      const request = (
        method: "get" | "post",
        path: string,
        headers: Record<string, string>
      ) =>
        (method === "get"
          ? api.get(path, { headers })
          : api.post(path, {}, { headers })
        ).then(
          (r: { status: number }) => r,
          (e: { response?: { status: number } }) => {
            if (!e.response) throw e;
            return e.response;
          }
        );

      const authed = (token: string): Record<string, string> => ({
        ...storeHeaders,
        authorization: `Bearer ${token}`,
      });

      const registerCustomer = async (email: string): Promise<string> => {
        const reg = await api.post("/auth/customer/emailpass/register", {
          email,
          password: PASSWORD,
        });
        await api.post(
          "/store/customers",
          { email },
          { headers: { ...storeHeaders, authorization: `Bearer ${reg.data.token}` } }
        );
        const login = await api.post("/auth/customer/emailpass", {
          email,
          password: PASSWORD,
        });
        return login.data.token;
      };

      it("rejects unauthenticated vault access with 401", async () => {
        expect((await request("get", "/store/vault", storeHeaders)).status).toBe(401);
        expect((await request("get", "/store/credits", storeHeaders)).status).toBe(401);
        expect(
          (await request("post", "/store/vault/pull-x/buyback", storeHeaders)).status
        ).toBe(401);
      });

      it("open → vault offer → buyback credits FMV×% once, restores stock, 404s foreign customers", async () => {
        const tokenA = await registerCustomer("vb-customer-a@test.dev");
        const tokenB = await registerCustomer("vb-customer-b@test.dev");

        // 1. Open the pack — the single-card pool guarantees the winner, and
        //    the response's rarity is the PER-PACK tier from the odds row.
        const open = await request(
          "post",
          `/store/packs/${PACK_SLUG}/open`,
          authed(tokenA)
        );
        expect(open.status).toBe(200);
        expect(open.data.card).toMatchObject({
          handle: CARD_HANDLE,
          rarity: "Rare",
          market_value: FMV,
        });
        const pullId: string = open.data.pull.id;
        expect(typeof pullId).toBe("string");

        // 2. The pull earmarked one physical unit.
        expect(await stockedQuantity()).toBe(STOCKED - 1);

        // 3. The vault lists the pull with the live offer — a FRESH pull is
        //    still inside the instant window, so the quote is the instant rate.
        const vault = await request("get", "/store/vault", authed(tokenA));
        expect(vault.status).toBe(200);
        expect(vault.data.items).toHaveLength(1);
        expect(vault.data.items[0]).toMatchObject({
          pull_id: pullId,
          pack_id: PACK_SLUG,
          card: { handle: CARD_HANDLE, rarity: "Rare", market_value: FMV },
          buyback: {
            percent: INSTANT_PERCENT,
            amount: INSTANT_AMOUNT,
            rate_type: "instant",
          },
        });

        // 4. Another customer cannot touch the pull — same 404 as an unknown
        //    id, so vault ids don't leak across accounts.
        const foreign = await request(
          "post",
          `/store/vault/${pullId}/buyback`,
          authed(tokenB)
        );
        expect(foreign.status).toBe(404);

        // 5. The owner's buyback (within the window) credits exactly
        //    FMV × instant % and reports the resulting balance.
        const buyback = await request(
          "post",
          `/store/vault/${pullId}/buyback`,
          authed(tokenA)
        );
        expect(buyback.status).toBe(200);
        expect(buyback.data).toMatchObject({
          pull_id: pullId,
          amount: INSTANT_AMOUNT,
          percent: INSTANT_PERCENT,
          rate_type: "instant",
          balance: INSTANT_AMOUNT,
        });

        // 6. The physical unit returned to stock.
        expect(await stockedQuantity()).toBe(STOCKED);

        // 7. The credit ledger shows the balance and exactly one transaction.
        const credits = await request("get", "/store/credits", authed(tokenA));
        expect(credits.status).toBe(200);
        expect(credits.data.balance).toBe(INSTANT_AMOUNT);
        expect(credits.data.transactions).toHaveLength(1);
        expect(credits.data.transactions[0]).toMatchObject({
          amount: INSTANT_AMOUNT,
          reason: "buyback",
          pull_id: pullId,
        });

        // 8. The card left the vault…
        const emptied = await request("get", "/store/vault", authed(tokenA));
        expect(emptied.data.items).toHaveLength(0);

        // 9. …and a second sell of the same pull is rejected (the unique
        //    credit row per pull is DB-enforced).
        const repeat = await request(
          "post",
          `/store/vault/${pullId}/buyback`,
          authed(tokenA)
        );
        expect(repeat.status).toBe(400);
        expect(repeat.data.message).toMatch(/already sold back/i);

        // 10. VAULT RATE: a pull OLDER than the instant window sells at the
        //     pack's vault %. Open again, then backdate rolled_at past the
        //     window (default 10 min) via the module service.
        const open2 = await request(
          "post",
          `/store/packs/${PACK_SLUG}/open`,
          authed(tokenA)
        );
        expect(open2.status).toBe(200);
        const pull2Id: string = open2.data.pull.id;
        expect(await stockedQuantity()).toBe(STOCKED - 1);

        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        await packs.updatePulls([
          { id: pull2Id, rolled_at: new Date(Date.now() - 11 * 60 * 1000) },
        ]);

        // The vault now quotes the vault rate for it…
        const vault2 = await request("get", "/store/vault", authed(tokenA));
        expect(vault2.data.items).toHaveLength(1);
        expect(vault2.data.items[0].buyback).toMatchObject({
          percent: VAULT_PERCENT,
          amount: VAULT_AMOUNT,
          rate_type: "vault",
        });

        // …and the buyback credits exactly that, on top of the prior balance.
        const buyback2 = await request(
          "post",
          `/store/vault/${pull2Id}/buyback`,
          authed(tokenA)
        );
        expect(buyback2.status).toBe(200);
        expect(buyback2.data).toMatchObject({
          pull_id: pull2Id,
          amount: VAULT_AMOUNT,
          percent: VAULT_PERCENT,
          rate_type: "vault",
          balance: INSTANT_AMOUNT + VAULT_AMOUNT,
        });
        expect(await stockedQuantity()).toBe(STOCKED);
      });
    });
  },
});
