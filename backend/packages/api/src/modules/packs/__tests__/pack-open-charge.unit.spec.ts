import { hasEnoughCredit } from "../pack-open-charge";

// Task A2 (2026-06-12): opening a pack debits its price from the credit
// ledger. The affordability rule compares in INTEGER CENTS — both sides are
// 2dp USD decimals, and a raw float compare would wrongly block a customer
// whose balance accumulated as 0.1 + 0.2 against a 0.3 price.

describe("hasEnoughCredit", () => {
  it("allows when the balance covers the price, including exactly", () => {
    expect(hasEnoughCredit(25, 10)).toBe(true);
    expect(hasEnoughCredit(10, 10)).toBe(true);
    expect(hasEnoughCredit(0.01, 0.01)).toBe(true);
  });

  it("blocks when the balance falls short by any whole cent", () => {
    expect(hasEnoughCredit(9.99, 10)).toBe(false);
    expect(hasEnoughCredit(0, 0.01)).toBe(false);
    expect(hasEnoughCredit(499.99, 500)).toBe(false);
  });

  it("compares in cents so float accumulation noise cannot block a fair open", () => {
    expect(hasEnoughCredit(0.1 + 0.2, 0.3)).toBe(true); // 0.30000000000000004
    expect(hasEnoughCredit(1.1 + 2.2, 3.3)).toBe(true); // 3.3000000000000003
  });

  it("treats a free pack as always affordable, even at zero balance", () => {
    expect(hasEnoughCredit(0, 0)).toBe(true);
  });
});
