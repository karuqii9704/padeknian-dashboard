import { describe, expect, it } from "vitest";
import { persenAtauNull } from "./progres";

describe("persenAtauNull", () => {
  it("menghitung 1 desimal", () => {
    expect(persenAtauNull(1, 3)).toBe(33.3);
    expect(persenAtauNull(2, 3)).toBe(66.7);
    expect(persenAtauNull(5, 5)).toBe(100);
  });
  it("tanpa data -> null (bukan 0 atau NaN)", () => {
    expect(persenAtauNull(0, 0)).toBeNull();
  });
  it("0 dari N -> 0", () => {
    expect(persenAtauNull(0, 4)).toBe(0);
  });
});
