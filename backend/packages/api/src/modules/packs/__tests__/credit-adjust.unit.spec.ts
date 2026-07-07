import {
  ADJUST_MAX_RM,
  adjustAmountError,
  adjustNoteError,
} from "../credit-adjust";

// Manual credit adjustment (operator grant/refund/clawback). The amount and
// note rules are pure functions so the workflow step stays a thin
// orchestrator and the rules are testable without a container.

describe("adjustAmountError", () => {
  it("accepts positive and negative 2dp amounts within the cap", () => {
    expect(adjustAmountError(5)).toBeNull();
    expect(adjustAmountError(-5)).toBeNull();
    expect(adjustAmountError(10.5)).toBeNull();
    expect(adjustAmountError(-0.01)).toBeNull();
    expect(adjustAmountError(ADJUST_MAX_RM)).toBeNull();
    expect(adjustAmountError(-ADJUST_MAX_RM)).toBeNull();
  });

  it("accepts 2dp amounts that are not exactly representable in binary", () => {
    // 10.1 * 100 = 1009.9999999999999 — a naive integer-cents check would
    // wrongly reject a perfectly valid amount.
    expect(adjustAmountError(10.1)).toBeNull();
    expect(adjustAmountError(-10.1)).toBeNull();
  });

  it("rejects zero (an adjustment must move the balance)", () => {
    expect(adjustAmountError(0)).toMatch(/zero/i);
  });

  it("rejects non-finite and non-number values", () => {
    expect(adjustAmountError(NaN)).toMatch(/number/i);
    expect(adjustAmountError(Infinity)).toMatch(/number/i);
    expect(adjustAmountError("50")).toMatch(/number/i);
    expect(adjustAmountError(null)).toMatch(/number/i);
    expect(adjustAmountError(undefined)).toMatch(/number/i);
  });

  it("rejects magnitudes above the cap in both directions", () => {
    expect(adjustAmountError(ADJUST_MAX_RM + 0.01)).toMatch(/at most/i);
    expect(adjustAmountError(-(ADJUST_MAX_RM + 0.01))).toMatch(/at most/i);
  });

  it("rejects sub-cent precision", () => {
    expect(adjustAmountError(1.234)).toMatch(/cent/i);
    expect(adjustAmountError(-0.001)).toMatch(/cent/i);
  });
});

describe("adjustNoteError", () => {
  it("accepts a short operator note", () => {
    expect(adjustNoteError("Goodwill credit for failed open")).toBeNull();
  });

  it("rejects missing, empty, and whitespace-only notes", () => {
    expect(adjustNoteError(undefined)).toMatch(/note/i);
    expect(adjustNoteError(null)).toMatch(/note/i);
    expect(adjustNoteError("")).toMatch(/note/i);
    expect(adjustNoteError("   ")).toMatch(/note/i);
  });

  it("rejects non-string values", () => {
    expect(adjustNoteError(42)).toMatch(/note/i);
    expect(adjustNoteError({})).toMatch(/note/i);
  });

  it("rejects notes longer than 512 chars", () => {
    expect(adjustNoteError("x".repeat(513))).toMatch(/long/i);
    expect(adjustNoteError("x".repeat(512))).toBeNull();
  });
});
