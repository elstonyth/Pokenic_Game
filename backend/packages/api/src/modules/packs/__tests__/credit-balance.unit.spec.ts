import { creditBalance } from "../credit-balance";
import type PacksModuleService from "../service";

// creditBalance pages the append-only ledger and sums in integer cents — a
// long ledger of 2dp amounts must never drift below/above the true total the
// way a running float sum can.

type Txn = { amount: number | string };

/** Fake service: serves `rows` through listCreditTransactions paging. */
const fakePacks = (rows: Txn[]) => {
  const calls: Array<{ skip: number; take: number }> = [];
  const packs = {
    listCreditTransactions: async (
      _filter: Record<string, unknown>,
      opts: { skip: number; take: number }
    ) => {
      calls.push({ skip: opts.skip, take: opts.take });
      return rows.slice(opts.skip, opts.skip + opts.take);
    },
  } as unknown as PacksModuleService;
  return { packs, calls };
};

describe("creditBalance", () => {
  it("returns 0 for an empty ledger", async () => {
    const { packs } = fakePacks([]);
    expect(await creditBalance(packs, "cus_1")).toBe(0);
  });

  it("sums amounts exactly in cents (no float drift)", async () => {
    // 0.1 + 0.2 is the canonical float trap (0.30000000000000004).
    const { packs } = fakePacks([
      { amount: 0.1 },
      { amount: 0.2 },
      { amount: 20.23 },
    ]);
    expect(await creditBalance(packs, "cus_1")).toBe(20.53);
  });

  it("stays exact across many small rows", async () => {
    // 3000 × $0.01 — a running float sum lands at 29.999999…; cents stay exact.
    const rows = Array.from({ length: 3000 }, () => ({ amount: 0.01 }));
    const { packs } = fakePacks(rows);
    expect(await creditBalance(packs, "cus_1")).toBe(30);
  });

  it("pages past the first page instead of truncating", async () => {
    const rows = Array.from({ length: 2500 }, () => ({ amount: 1 }));
    const { packs, calls } = fakePacks(rows);
    expect(await creditBalance(packs, "cus_1")).toBe(2500);
    expect(calls.length).toBeGreaterThan(2); // 1000-row pages → 3 calls
    expect(calls[1].skip).toBe(calls[0].take);
  });

  it("handles bigNumber string amounts from the ORM", async () => {
    const { packs } = fakePacks([{ amount: "12.34" }, { amount: "0.66" }]);
    expect(await creditBalance(packs, "cus_1")).toBe(13);
  });
});
