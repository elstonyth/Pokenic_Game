import {
  FLAT_PERCENT,
  buybackAmount,
  instantBuybackWindowMs,
  resolveBuybackRate,
} from "../buyback-rate";

// Business rule (2026-06-12): the pack's buyback_percent applies only inside
// the instant window (the on-reveal keep/sell countdown). The moment a card
// sits in the vault/inventory, every sell is at the FLAT rate — per-pack vault
// rates no longer exist.

const NOW = 1_750_000_000_000;
const rolledAt = (msAgo: number) => new Date(NOW - msAgo);

describe("resolveBuybackRate", () => {
  const pack = { buyback_percent: 95 };

  it("credits the pack rate inside the instant window", () => {
    expect(resolveBuybackRate(pack, rolledAt(1_000), NOW)).toEqual({
      percent: 95,
      rate_type: "instant",
    });
  });

  it("falls back to the flat rate inside the window when the pack is gone or the rate is invalid", () => {
    expect(resolveBuybackRate(null, rolledAt(1_000), NOW).percent).toBe(
      FLAT_PERCENT
    );
    expect(
      resolveBuybackRate({ buyback_percent: 250 }, rolledAt(1_000), NOW).percent
    ).toBe(FLAT_PERCENT);
  });

  it("floors a legacy below-flat pack rate at the flat rate inside the window", () => {
    expect(
      resolveBuybackRate({ buyback_percent: 80 }, rolledAt(1_000), NOW)
    ).toEqual({ percent: FLAT_PERCENT, rate_type: "instant" });
  });

  it("credits the FLAT rate after the window, ignoring the pack rate entirely", () => {
    const afterWindow = rolledAt(instantBuybackWindowMs() + 1);
    expect(resolveBuybackRate(pack, afterWindow, NOW)).toEqual({
      percent: FLAT_PERCENT,
      rate_type: "vault",
    });
  });

  it("treats an unparsable rolled_at as outside the window (flat rate)", () => {
    expect(resolveBuybackRate(pack, "not-a-date", NOW)).toEqual({
      percent: FLAT_PERCENT,
      rate_type: "vault",
    });
  });
});

describe("buybackAmount", () => {
  it("computes FMV × percent to whole cents", () => {
    expect(buybackAmount(21.99, 92)).toBe(20.23); // 2199¢ × 92% = 2023.08¢
    expect(buybackAmount(19.2, 100)).toBe(19.2);
    expect(buybackAmount(0, 90)).toBe(0);
  });

  it("rounds an exact half-cent up, where naive float math rounds down", () => {
    // 15¢ × 90% = 13.5¢ → 14¢. Float path: 0.15*90 = 13.499999999999998 → 13¢.
    expect(buybackAmount(0.15, 90)).toBe(0.14);
    expect(buybackAmount(2.45, 90)).toBe(2.21); // 220.5¢ → 221¢
    expect(buybackAmount(0.05, 90)).toBe(0.05); // 4.5¢ → 5¢
  });

  it("matches the quote for every catalog-shaped FMV at every legal whole percent", () => {
    // Quote (vault route) and credit (buyback workflow) share this helper, so
    // determinism across the whole input space IS the contract: same in, same out.
    for (let cents = 0; cents <= 5000; cents += 7) {
      const fmv = cents / 100;
      for (const pct of [90, 92, 95, 100]) {
        const expected = Math.round((cents * pct) / 100) / 100;
        expect(buybackAmount(fmv, pct)).toBe(expected);
      }
    }
  });
});

describe("instantBuybackWindowMs", () => {
  const KEY = "BUYBACK_INSTANT_WINDOW_MS";
  const saved = process.env[KEY];
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  it("defaults to 90s — the 30s on-screen countdown plus reveal-animation and network grace", () => {
    delete process.env[KEY];
    expect(instantBuybackWindowMs()).toBe(90_000);
  });

  it("honors a valid env override and rejects invalid ones", () => {
    process.env[KEY] = "5000";
    expect(instantBuybackWindowMs()).toBe(5_000);
    process.env[KEY] = "0";
    expect(instantBuybackWindowMs()).toBe(90_000);
    process.env[KEY] = "soon";
    expect(instantBuybackWindowMs()).toBe(90_000);
  });
});
