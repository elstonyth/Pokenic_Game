import PacksModuleService from "../service";

// creditBalance pages the append-only ledger and sums in integer cents — a
// long ledger of 2dp amounts must never drift below/above the true total the
// way a running float sum can.
//
// We test PacksModuleService.prototype.creditBalance directly by constructing a
// prototype-linked object and stubbing listCreditTransactions.

type Txn = { amount: number | string };

/** Fake service: serves `rows` through listCreditTransactions paging. */
const fakeService = (rows: Txn[]) => {
  const calls: Array<{ skip: number; take: number }> = [];
  // Object.create keeps the prototype chain intact so `instanceof` checks pass,
  // and then we assign the stub directly so creditBalance() calls our fake.
  const svc = Object.create(
    PacksModuleService.prototype
  ) as PacksModuleService;
  (svc as unknown as Record<string, unknown>).listCreditTransactions = async (
    _filter: Record<string, unknown>,
    opts: { skip: number; take: number }
  ) => {
    calls.push({ skip: opts.skip, take: opts.take });
    return rows.slice(opts.skip, opts.skip + opts.take);
  };
  return { svc, calls };
};

describe("PacksModuleService.creditBalance", () => {
  it("returns 0 for an empty ledger", async () => {
    const { svc } = fakeService([]);
    expect(await svc.creditBalance("cus_1")).toBe(0);
  });

  it("sums amounts exactly in cents (no float drift)", async () => {
    // 0.1 + 0.2 is the canonical float trap (0.30000000000000004).
    const { svc } = fakeService([
      { amount: 0.1 },
      { amount: 0.2 },
      { amount: 20.23 },
    ]);
    expect(await svc.creditBalance("cus_1")).toBe(20.53);
  });

  it("stays exact across many small rows", async () => {
    // 3000 × $0.01 — a running float sum lands at 29.999999…; cents stay exact.
    const rows = Array.from({ length: 3000 }, () => ({ amount: 0.01 }));
    const { svc } = fakeService(rows);
    expect(await svc.creditBalance("cus_1")).toBe(30);
  });

  it("pages past the first page instead of truncating", async () => {
    const rows = Array.from({ length: 2500 }, () => ({ amount: 1 }));
    const { svc, calls } = fakeService(rows);
    expect(await svc.creditBalance("cus_1")).toBe(2500);
    expect(calls.length).toBeGreaterThan(2); // 1000-row pages → 3 calls
    expect(calls[1].skip).toBe(calls[0].take);
  });

  it("handles bigNumber string amounts from the ORM", async () => {
    const { svc } = fakeService([{ amount: "12.34" }, { amount: "0.66" }]);
    expect(await svc.creditBalance("cus_1")).toBe(13);
  });
});
