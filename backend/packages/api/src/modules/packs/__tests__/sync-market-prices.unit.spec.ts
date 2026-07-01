import { refreshCardPrice } from "../sync-market-prices";

const card = {
  id: "c1",
  handle: "charizard-psa-10",
  pc_product_id: "6910",
  pc_grade: "PSA 10",
  market_value: 100,
};

test("updates from tier price", async () => {
  const upd: any[] = [];
  const r = await refreshCardPrice(card as any, {
    pcFetch: async () => ({ kind: "ok", data: { "manual-only-price": 15000 } }),
    updateCards: async (u: any) => {
      upd.push(u[0]);
    },
    now: new Date("2026-07-01T00:00:00Z"),
  });
  expect(r.newValue).toBe(150);
  expect(r.changed).toBe(true);
  expect(upd[0].market_value).toBe(150);
});

test("keeps last-known on error", async () => {
  const r = await refreshCardPrice(card as any, {
    pcFetch: async () => ({ kind: "error", message: "boom" }),
    updateCards: async () => {
      throw new Error("no write");
    },
    now: new Date("2026-07-01T00:00:00Z"),
  });
  expect(r.changed).toBe(false);
  expect(r.skippedReason).toBe("boom");
});

test("skips zero price", async () => {
  const r = await refreshCardPrice(card as any, {
    pcFetch: async () => ({ kind: "ok", data: { "manual-only-price": 0 } }),
    updateCards: async () => {
      throw new Error("no write");
    },
    now: new Date("2026-07-01T00:00:00Z"),
  });
  expect(r.changed).toBe(false);
  expect(r.skippedReason).toMatch(/no usable price/i);
});
