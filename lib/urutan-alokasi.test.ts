import { describe, expect, it } from "vitest";
import { sisaTarget, urutkanAlokasi } from "./urutan-alokasi";

describe("urutkanAlokasi", () => {
  const a = (judul: string, prioritas: string, tanggalSelesai: string) => ({ judul, prioritas, tanggalSelesai });
  it("TINGGI dengan deadline terdekat di paling atas", () => {
    const r = urutkanAlokasi([
      a("rendah dekat", "RENDAH", "2026-10-10"),
      a("tinggi jauh", "TINGGI", "2026-10-30"),
      a("tinggi dekat", "TINGGI", "2026-10-15"),
      a("sedang", "SEDANG", "2026-10-12"),
    ]);
    expect(r.map((x) => x.judul)).toEqual(["tinggi dekat", "tinggi jauh", "sedang", "rendah dekat"]);
  });
  it("tidak mengubah array asal", () => {
    const asal = [a("b", "RENDAH", "2026-10-02"), a("a", "TINGGI", "2026-10-01")];
    urutkanAlokasi(asal);
    expect(asal[0].judul).toBe("b");
  });
});

describe("sisaTarget", () => {
  it("target dikurangi disetujui dan menunggu", () => expect(sisaTarget(100, 30, 10)).toBe(60));
  it("habis/berlebih -> 1", () => {
    expect(sisaTarget(100, 100, 0)).toBe(1);
    expect(sisaTarget(100, 90, 20)).toBe(1);
  });
  it("desimal", () => expect(sisaTarget(10.5, 0.25, 0)).toBe(10.25));
});
