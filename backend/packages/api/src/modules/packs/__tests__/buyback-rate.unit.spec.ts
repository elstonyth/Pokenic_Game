import {
  FLAT_PERCENT,
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
