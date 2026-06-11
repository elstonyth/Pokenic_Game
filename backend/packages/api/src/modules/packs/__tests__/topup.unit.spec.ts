import {
  TOPUP_MAX_USD,
  mockCharge,
  topUpAmountError,
} from "../topup";

// Task A1 (2026-06-12): credit top-ups through a fake gateway. The amount
// rules and the decline seam are pure functions so the workflow step stays a
// thin orchestrator and the rules are testable without a container.

describe("topUpAmountError", () => {
  it("accepts whole-dollar and 2dp amounts within the cap", () => {
    expect(topUpAmountError(5)).toBeNull();
    expect(topUpAmountError(10.5)).toBeNull();
    expect(topUpAmountError(0.01)).toBeNull();
    expect(topUpAmountError(TOPUP_MAX_USD)).toBeNull();
  });

  it("accepts 2dp amounts that are not exactly representable in binary", () => {
    // 10.1 * 100 = 1009.9999999999999 — a naive integer-cents check would
    // wrongly reject a perfectly valid amount.
    expect(topUpAmountError(10.1)).toBeNull();
    expect(topUpAmountError(0.29)).toBeNull();
  });

  it("rejects zero and negative amounts", () => {
    expect(topUpAmountError(0)).toMatch(/greater than/i);
    expect(topUpAmountError(-5)).toMatch(/greater than/i);
  });

  it("rejects non-finite and non-number values", () => {
    expect(topUpAmountError(NaN)).toMatch(/number/i);
    expect(topUpAmountError(Infinity)).toMatch(/number/i);
    expect(topUpAmountError("50")).toMatch(/number/i);
    expect(topUpAmountError(null)).toMatch(/number/i);
    expect(topUpAmountError(undefined)).toMatch(/number/i);
  });

  it("rejects amounts above the cap", () => {
    expect(topUpAmountError(TOPUP_MAX_USD + 0.01)).toMatch(/at most/i);
  });

  it("rejects sub-cent precision", () => {
    expect(topUpAmountError(1.234)).toMatch(/cent/i);
    expect(topUpAmountError(0.001)).toMatch(/cent/i);
  });
});

describe("mockCharge", () => {
  const customer = "cus_test";

  it("approves a normal amount with a gateway reference", () => {
    const result = mockCharge({ amount: 25, customer_id: customer });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reference).toMatch(/^mock_/);
    }
  });

  it("issues a distinct reference per charge", () => {
    const a = mockCharge({ amount: 25, customer_id: customer });
    const b = mockCharge({ amount: 25, customer_id: customer });
    if (a.ok && b.ok) {
      expect(a.reference).not.toBe(b.reference);
    } else {
      throw new Error("both charges should approve");
    }
  });

  it("declines any amount ending in .13 (the demo decline path)", () => {
    for (const amount of [0.13, 10.13, 999.13]) {
      const result = mockCharge({ amount, customer_id: customer });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.declined_reason).toMatch(/declined/i);
      }
    }
  });

  it("approves near-miss amounts that do not end in .13", () => {
    for (const amount of [13, 1.3, 10.31, 13.31]) {
      expect(mockCharge({ amount, customer_id: customer }).ok).toBe(true);
    }
  });
});
