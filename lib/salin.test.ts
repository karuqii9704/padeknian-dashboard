import { describe, expect, it } from "vitest";
import { bulanSebelumnya, geserTanggal } from "./salin";

describe("geserTanggal", () => {
  it("mempertahankan hari dalam bulan", () => {
    expect(geserTanggal("2026-09-05", 2026, 10)).toBe("2026-10-05");
  });
  it("memotong ke hari terakhir bila hari tidak ada", () => {
    expect(geserTanggal("2026-10-31", 2026, 11)).toBe("2026-11-30");
    expect(geserTanggal("2027-01-31", 2027, 2)).toBe("2027-02-28");
    expect(geserTanggal("2027-12-30", 2028, 2)).toBe("2028-02-29");
  });
  it("lintas tahun", () => {
    expect(geserTanggal("2026-12-15", 2027, 1)).toBe("2027-01-15");
  });
});

describe("bulanSebelumnya", () => {
  it("bulan biasa dan Januari", () => {
    expect(bulanSebelumnya(2026, 10)).toEqual({ tahun: 2026, bulan: 9 });
    expect(bulanSebelumnya(2026, 1)).toEqual({ tahun: 2025, bulan: 12 });
  });
});
