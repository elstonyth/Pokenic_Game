import { toMoney } from "../money";

describe("toMoney", () => {
  it("passes through a plain number", () => {
    expect(toMoney(12.34)).toBe(12.34);
  });
  it("coerces a numeric string (numeric column shape)", () => {
    expect(toMoney("0.15")).toBe(0.15);
  });
  it("coerces a BigNumber-like value via its numeric valueOf", () => {
    expect(toMoney({ valueOf: () => 7.5 } as unknown as number)).toBe(7.5);
  });
  it("preserves Number() semantics for null/undefined", () => {
    // Behavior-preserving: current call sites use Number(x);
    // Number(null)=0, Number(undefined)=NaN. Lock that exact behavior.
    expect(toMoney(null)).toBe(0);
    expect(Number.isNaN(toMoney(undefined))).toBe(true);
  });
});
