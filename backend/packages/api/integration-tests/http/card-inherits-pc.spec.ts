import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import { MercurModules, SellerStatus } from "@mercurjs/types";
import {
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
} from "@medusajs/medusa/core-flows";
import { mintSuperAdmin, unwrapResponse } from "./utils";

jest.setTimeout(240 * 1000);

const PASSWORD = "card-inherits-pc-test-pw-1";
const ADMIN_EMAIL = "admin-card-inherits-pc@test.dev";

// Same minimal catalog prerequisites as product-from-pc.spec.ts: registering
// a card also needs the house seller link + a published-status check.
async function ensureCatalogPrereqs(container: MedusaContainer) {
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
  const fulfillmentService = container.resolve(Modules.FULFILLMENT);
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION);
  const sellerService = container.resolve<{
    listSellers: (f: { handle: string }) => Promise<Array<{ id: string }>>;
    createSellers: (data: unknown[]) => Promise<Array<{ id: string }>>;
  }>(MercurModules.SELLER);

  const existingChannels = await salesChannelService.listSalesChannels(
    { name: "Default Sales Channel" },
    { take: 1 },
  );
  if (!existingChannels.length) {
    await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Default Sales Channel" }] },
    });
  }

  const existingProfiles = await fulfillmentService.listShippingProfiles(
    {},
    { take: 1 },
  );
  if (!existingProfiles.length) {
    await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    });
  }

  const existingLocations = await stockLocationService.listStockLocations(
    {},
    { take: 1 },
  );
  if (!existingLocations.length) {
    await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: "Test Warehouse",
            address: { city: "Kuala Lumpur", country_code: "MY", address_1: "" },
          },
        ],
      },
    });
  }

  const existingSellers = await sellerService.listSellers({ handle: "house" });
  if (!existingSellers.length) {
    await sellerService.createSellers([
      {
        name: "House",
        handle: "house",
        email: "house@pokenic.local",
        currency_code: "myr",
        status: SellerStatus.OPEN,
        metadata: { house: true },
      },
    ]);
  }
}

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe("card registration inherits the PriceCharting link", () => {
      let adminToken: string;

      beforeEach(async () => {
        const container = getContainer();
        await ensureCatalogPrereqs(container);
        adminToken = await mintSuperAdmin(container, api, ADMIN_EMAIL, PASSWORD);
      });

      const adminHeaders = () => ({
        headers: { authorization: `Bearer ${adminToken}` },
      });

      it("card registered from a PC product inherits the link", async () => {
        // pixel_pokemon_id is now required at product creation (2026-07-11) —
        // stage a library entry like the operator flow does.
        const pp = await unwrapResponse(
          api.post(
            "/admin/pixel-pokemon",
            {
              name: "Charizard",
              dex: 6,
              image_url: "https://example.com/charizard-pixel.png",
            },
            adminHeaders(),
          ),
        );

        const p = await unwrapResponse(
          api.post(
            "/admin/products/from-pricecharting",
            {
              pc_product_id: "6910",
              pc_grade: "PSA 10",
              name: "Charizard",
              set: "Base Set",
              grader: "PSA",
              grade: "10",
              market_value: 100,
              image: "https://example.com/charizard.png",
              pixel_pokemon_id: pp.data.pixel_pokemon.id as string,
            },
            adminHeaders(),
          ),
        );

        await unwrapResponse(
          api.post(
            "/admin/cards",
            {
              product_id: p.data.product.id,
              set: "Base Set",
              grader: "PSA",
              grade: "10",
              market_value: 100,
            },
            adminHeaders(),
          ),
        );

        const { data } = await unwrapResponse(
          api.get(`/admin/cards/${p.data.product.handle}`, adminHeaders()),
        );
        expect(data.card.pc_product_id).toBe("6910");
        expect(data.card.pc_grade).toBe("PSA 10");
        // Product creation stores no margin — registration without an explicit
        // market_multiplier falls back to the 20% default.
        expect(data.card.market_multiplier).toBe(1.2);
      });

      it("explicit margin from the register dialog wins over the default", async () => {
        // Spec 2 §5 (id-only): the pixel-Pokémon is assigned by a PixelPokemon
        // library id, not a raw dex. Stage a dex-9 entry, pick it at product
        // creation, and the registered card links it + mirrors its dex.
        const pp = await unwrapResponse(
          api.post(
            "/admin/pixel-pokemon",
            {
              name: "Blastoise",
              dex: 9,
              image_url: "https://example.com/blastoise-pixel.png",
            },
            adminHeaders(),
          ),
        );
        const pixelId = pp.data.pixel_pokemon.id as string;

        const p = await unwrapResponse(
          api.post(
            "/admin/products/from-pricecharting",
            {
              pc_product_id: "6911",
              pc_grade: "PSA 9",
              name: "Blastoise",
              set: "Base Set",
              grader: "PSA",
              grade: "9",
              market_value: 50,
              image: "https://example.com/blastoise.png",
              pixel_pokemon_id: pixelId,
            },
            adminHeaders(),
          ),
        );

        await unwrapResponse(
          api.post(
            "/admin/cards",
            {
              product_id: p.data.product.id,
              set: "Base Set",
              grader: "PSA",
              grade: "9",
              market_value: 50,
              market_multiplier: 1.35,
            },
            adminHeaders(),
          ),
        );

        const { data } = await unwrapResponse(
          api.get(`/admin/cards/${p.data.product.handle}`, adminHeaders()),
        );
        expect(data.card.market_multiplier).toBe(1.35);
        // Pixel-Pokémon staged at product creation is inherited by the card.
        expect(data.card.pokemon_dex).toBe(9);
      });
    });
  },
});
