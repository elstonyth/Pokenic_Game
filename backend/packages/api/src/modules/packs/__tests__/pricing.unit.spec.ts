import { displayMarketPrice, effectiveRate, DEFAULT_USD_MYR } from "../pricing";

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
