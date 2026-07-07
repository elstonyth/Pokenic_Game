import { displayMarketPrice, effectiveRate, resolveFxRateStrict, DEFAULT_USD_MYR } from "../pricing";

test("raw×fx×mult rounded", () => {
  expect(displayMarketPrice(100, 4.7, 1.2)).toBe(564);
  expect(displayMarketPrice(19.99, 4.5, 1.2)).toBe(107.95);
});

test("invalid → 0", () => {
  expect(displayMarketPrice(-1, 4.7, 1.2)).toBe(0);
  expect(displayMarketPrice(100, 0, 1.2)).toBe(0);
  expect(displayMarketPrice(NaN, 4.7, 1.2)).toBe(0);
});

test("effectiveRate override/fallback", () => {
  expect(effectiveRate({ rate: 4.5, manual_override: true, manual_rate: 4.8 })).toBe(4.8);
  expect(effectiveRate({ rate: 4.5, manual_override: false, manual_rate: null })).toBe(4.5);
  expect(effectiveRate({ rate: 0, manual_override: false, manual_rate: null })).toBe(DEFAULT_USD_MYR);
  expect(effectiveRate(null)).toBe(DEFAULT_USD_MYR);
});

describe('resolveFxRateStrict — no silent fallback on money paths', () => {
  it('returns the manual override when set', async () => {
    const rate = await resolveFxRateStrict({
      listFxRates: async () => [
        { rate: 4.7, manual_override: true, manual_rate: 4.0 },
      ],
    });
    expect(rate).toBe(4.0);
  });

  it('returns the fetched rate otherwise', async () => {
    const rate = await resolveFxRateStrict({
      listFxRates: async () => [
        { rate: 4.55, manual_override: false, manual_rate: null },
      ],
    });
    expect(rate).toBe(4.55);
  });

  it('throws when no row exists (never the hardcoded default)', async () => {
    await expect(
      resolveFxRateStrict({ listFxRates: async () => [] }),
    ).rejects.toThrow(/exchange rate/i);
  });

  it('throws when the query fails', async () => {
    await expect(
      resolveFxRateStrict({
        listFxRates: async () => {
          throw new Error('db down');
        },
      }),
    ).rejects.toThrow(/exchange rate/i);
  });

  it('throws when the stored rate is unusable', async () => {
    await expect(
      resolveFxRateStrict({
        listFxRates: async () => [
          { rate: 0, manual_override: false, manual_rate: null },
        ],
      }),
    ).rejects.toThrow(/exchange rate/i);
  });
});
