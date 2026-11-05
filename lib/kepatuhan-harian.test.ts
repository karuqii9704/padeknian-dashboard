import { describe, expect, it } from "vitest";
import { hitungKepatuhanHarian, rataKepatuhan } from "./kepatuhan-harian";

const wajib = new Set(["a", "b", "c", "d"]);
const hk = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"];

describe("hitungKepatuhanHarian", () => {
  it("menghitung pegawai unik wajib lapor per hari kerja; entri ganda dihitung sekali", () => {
    const r = hitungKepatuhanHarian(hk, "2026-10-06", [
      { userId: "a", tanggal: "2026-10-01" },
      { userId: "a", tanggal: "2026-10-01" },
      { userId: "b", tanggal: "2026-10-01" },
      { userId: "c", tanggal: "2026-10-02" },
    ], wajib);
    expect(r[0]).toEqual({ tanggal: "2026-10-01", pengisi: 2, wajib: 4, persen: 50 });
    expect(r[1]).toMatchObject({ pengisi: 1, persen: 25 });
  });
  it("hari kerja tanpa pengisi tetap muncul sebagai 0%", () => {
    const r = hitungKepatuhanHarian(hk, "2026-10-06", [], wajib);
    expect(r).toHaveLength(4);
    expect(r.every((h) => h.persen === 0)).toBe(true);
  });
  it("mengabaikan hari yang belum tiba, hari libur/akhir pekan, dan akun di luar wajib lapor", () => {
    const r = hitungKepatuhanHarian(hk, "2026-10-02", [
      { userId: "admin", tanggal: "2026-10-01" },
      { userId: "a", tanggal: "2026-10-03" }, // Sabtu, bukan hari kerja
    ], wajib);
    expect(r.map((h) => h.tanggal)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(r[0].pengisi).toBe(0);
  });
  it("persen null bila tidak ada pegawai wajib lapor; rata-rata mengabaikan null", () => {
    expect(hitungKepatuhanHarian(hk, "2026-10-01", [], new Set())[0].persen).toBeNull();
    expect(rataKepatuhan([])).toBeNull();
    expect(rataKepatuhan(hitungKepatuhanHarian(hk, "2026-10-02", [{ userId: "a", tanggal: "2026-10-01" }], wajib))).toBe(12.5);
  });
});
