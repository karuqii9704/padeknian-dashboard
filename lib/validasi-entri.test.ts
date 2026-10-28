import { describe, expect, it } from "vitest";
import { selisihHari, tambahHari, validasiTanggalEntri, type PeriodeUntukValidasi } from "./validasi-entri";

// Oktober 2026: 1 Okt = Kamis. Sabtu: 3, 10, 17, 24, 31. Minggu: 4, 11, 18, 25.
const aktif: PeriodeUntukValidasi = { status: "AKTIF", tanggalMulai: "2026-10-01", tanggalSelesai: "2026-10-31" };
const libur = new Map([["2026-10-08", "Libur uji"]]);
const cek = (tanggal: string, hariIni: string, periode = aktif) => validasiTanggalEntri({ tanggal, hariIni, periode, libur });

describe("validasiTanggalEntri", () => {
  it("hari ini (hari kerja) valid dan bukan backfill", () => {
    expect(cek("2026-10-14", "2026-10-14")).toEqual({ ok: true, isBackfill: false });
  });

  it("mundur 1-3 hari kalender valid dan ditandai backfill", () => {
    expect(cek("2026-10-13", "2026-10-14")).toEqual({ ok: true, isBackfill: true });
    expect(cek("2026-10-12", "2026-10-15")).toEqual({ ok: true, isBackfill: true }); // tepat 3 hari
  });

  it("mundur 4 hari ditolak dengan pesan batas", () => {
    const r = cek("2026-10-12", "2026-10-16");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.pesan).toContain("maksimal 3 hari kalender");
      expect(r.pesan).toContain("2026-10-13");
    }
  });

  it("Sabtu dan Minggu ditolak dengan nama hari", () => {
    const sabtu = cek("2026-10-10", "2026-10-12");
    const minggu = cek("2026-10-11", "2026-10-12");
    expect(sabtu.ok === false && sabtu.pesan).toContain("Sabtu, 2026-10-10 adalah akhir pekan");
    expect(minggu.ok === false && minggu.pesan).toContain("Minggu, 2026-10-11 adalah akhir pekan");
  });

  it("hari libur ditolak dengan keterangannya", () => {
    const r = cek("2026-10-08", "2026-10-09");
    expect(r.ok === false && r.pesan).toBe("2026-10-08 adalah hari libur (Libur uji). Pekerjaan hanya dapat dicatat pada hari kerja.");
  });

  it("tanggal di masa depan ditolak", () => {
    const r = cek("2026-10-15", "2026-10-14");
    expect(r.ok === false && r.pesan).toBe("Tanggal tidak boleh di masa depan.");
  });

  it("di luar rentang periode ditolak", () => {
    const r = cek("2026-09-30", "2026-10-01"); // 1 hari lalu tapi periode berbeda
    expect(r.ok === false && r.pesan).toBe("Tanggal berada di luar rentang periode.");
  });

  it("periode DRAFT ditolak; DIKUNCI 409", () => {
    const draft = cek("2026-10-14", "2026-10-14", { ...aktif, status: "DRAFT" });
    expect(draft.ok === false && draft.pesan).toContain("belum diaktifkan");
    const kunci = cek("2026-10-14", "2026-10-14", { ...aktif, status: "DIKUNCI" });
    expect(kunci.ok === false && kunci.status).toBe(409);
  });

  it("akhir pekan yang juga libur: pesan akhir pekan didahulukan", () => {
    const l = new Map([["2026-10-10", "Libur Sabtu"]]);
    const r = validasiTanggalEntri({ tanggal: "2026-10-10", hariIni: "2026-10-12", periode: aktif, libur: l });
    expect(r.ok === false && r.pesan).toContain("akhir pekan");
  });

  it("hari Senin mencatat hari Jumat sebelumnya (3 hari) valid", () => {
    expect(cek("2026-10-09", "2026-10-12")).toEqual({ ok: true, isBackfill: true });
  });

  it("batas bulan: backfill ke bulan sebelumnya ditolak bila bukan periode itu", () => {
    const r = cek("2026-09-30", "2026-10-02");
    expect(r.ok).toBe(false);
  });
});

describe("util tanggal", () => {
  it("selisihHari & tambahHari", () => {
    expect(selisihHari("2026-10-15", "2026-10-12")).toBe(3);
    expect(tambahHari("2026-10-01", -1)).toBe("2026-09-30");
    expect(tambahHari("2026-12-31", 1)).toBe("2027-01-01");
  });
});
