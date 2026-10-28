import { describe, expect, it } from "vitest";
import { statusHari, susunKalender } from "./kalender-status";

describe("statusHari", () => {
  it("tanpa entri = KOSONG", () => expect(statusHari([])).toBe("KOSONG"));
  it("hanya MENUNGGU", () => expect(statusHari(["MENUNGGU"])).toBe("MENUNGGU"));
  it("hanya DISETUJUI", () => expect(statusHari(["DISETUJUI", "DISETUJUI"])).toBe("DISETUJUI"));
  it("campuran MENUNGGU + DISETUJUI -> MENUNGGU (masih ada yang belum diverifikasi)", () =>
    expect(statusHari(["DISETUJUI", "MENUNGGU"])).toBe("MENUNGGU"));
  it("ada MINTA_REVISI mengalahkan semuanya", () =>
    expect(statusHari(["DISETUJUI", "MENUNGGU", "MINTA_REVISI"])).toBe("REVISI"));
  it("DITOLAK dihitung perlu tindakan (REVISI)", () => expect(statusHari(["DITOLAK"])).toBe("REVISI"));
});

describe("susunKalender (Oktober 2026)", () => {
  const mulai = new Date("2026-10-01T00:00:00Z");
  const selesai = new Date("2026-10-31T00:00:00Z");
  const libur = new Map([["2026-10-08", "Libur uji"]]);
  const hari = susunKalender(mulai, selesai, libur, [
    { tanggal: "2026-10-05", statusVerifikasi: "DISETUJUI" },
    { tanggal: "2026-10-06", statusVerifikasi: "MENUNGGU" },
    { tanggal: "2026-10-07", statusVerifikasi: "MINTA_REVISI" },
    { tanggal: "2026-10-07", statusVerifikasi: "DISETUJUI" },
  ]);
  const by = (t: string) => hari.find((h) => h.tanggal === t)!;

  it("31 hari, 22 hari kerja dikurangi 1 libur = 21", () => {
    expect(hari).toHaveLength(31);
    expect(hari.filter((h) => h.hariKerja)).toHaveLength(21);
  });
  it("4 status warna", () => {
    expect(by("2026-10-02").status).toBe("KOSONG");
    expect(by("2026-10-05").status).toBe("DISETUJUI");
    expect(by("2026-10-06").status).toBe("MENUNGGU");
    expect(by("2026-10-07").status).toBe("REVISI");
    expect(by("2026-10-07").jumlah).toBe(2);
  });
  it("akhir pekan dan libur tidak punya status", () => {
    expect(by("2026-10-03")).toMatchObject({ hariKerja: false, akhirPekan: true, status: null });
    expect(by("2026-10-08")).toMatchObject({ hariKerja: false, libur: "Libur uji", status: null });
  });
});
