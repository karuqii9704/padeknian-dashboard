import { describe, expect, it } from "vitest";
import { ukuran } from "./format-ukuran";

describe("ukuran", () => {
  it("format basis 1024 berlocale id", () => {
    expect(ukuran(0)).toBe("0 B");
    expect(ukuran(1536)).toBe("1,5 KB");
    expect(ukuran(10 * 1024 ** 3)).toBe("10 GB");
  });
});
