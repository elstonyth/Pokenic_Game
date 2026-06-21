import { consumeExternalSen } from "../external-funded";

describe("consumeExternalSen", () => {
  it("consumes the full price when external balance covers it", () => {
    expect(consumeExternalSen(7500, 10000)).toBe(7500);
  });

  it("consumes only the available external balance when price exceeds it", () => {
    expect(consumeExternalSen(7500, 3000)).toBe(3000);
  });

  it("consumes the exact balance at the boundary", () => {
    expect(consumeExternalSen(5000, 5000)).toBe(5000);
  });

  it("consumes nothing when external balance is zero", () => {
    expect(consumeExternalSen(7500, 0)).toBe(0);
  });

  it("never returns negative for a negative external balance (defensive)", () => {
    expect(consumeExternalSen(7500, -200)).toBe(0);
  });

  it("consumes nothing for a non-positive price (free pack / guard)", () => {
    expect(consumeExternalSen(0, 10000)).toBe(0);
    expect(consumeExternalSen(-100, 10000)).toBe(0);
  });
});
