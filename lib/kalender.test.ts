import { describe, expect, it } from "vitest";
import { formatTanggal, hariKerjaEfektif, isAkhirPekan, rentangBulan } from "./kalender";

describe("rentangBulan", () => {
  it("Oktober 2026: 1–31", () => {
    const r = rentangBulan(2026, 10);
    expect(formatTanggal(r.mulai)).toBe("2026-10-01");
    expect(formatTanggal(r.selesai)).toBe("2026-10-31");
  });
  it("Februari kabisat 2028 berakhir tanggal 29", () => {
    expect(formatTanggal(rentangBulan(2028, 2).selesai)).toBe("2028-02-29");
  });
  it("Desember berakhir 31", () => {
    expect(formatTanggal(rentangBulan(2026, 12).selesai)).toBe("2026-12-31");
  });
});

describe("hariKerjaEfektif", () => {
  // Oktober 2026: 1 Okt = Kamis. Hitungan manual: minggu kerja
  // 1-2 (2), 5-9 (5), 12-16 (5), 19-23 (5), 26-30 (5) = 22 hari kerja.
  const { mulai, selesai } = rentangBulan(2026, 10);

  it("22 hari kerja tanpa libur (hitungan manual)", () => {
    expect(hariKerjaEfektif(mulai, selesai, [])).toHaveLength(22);
  });
  it("mengurangi libur yang jatuh di hari kerja", () => {
    const r = hariKerjaEfektif(mulai, selesai, ["2026-10-07", "2026-10-08"]);
    expect(r).toHaveLength(20);
    expect(r).not.toContain("2026-10-07");
  });
  it("libur yang jatuh di akhir pekan tidak mengurangi dua kali", () => {
    expect(hariKerjaEfektif(mulai, selesai, ["2026-10-03", "2026-10-04"])).toHaveLength(22);
  });
  it("tidak memuat Sabtu/Minggu", () => {
    for (const s of hariKerjaEfektif(mulai, selesai, [])) {
      expect(isAkhirPekan(new Date(`${s}T00:00:00Z`))).toBe(false);
    }
  });
});
