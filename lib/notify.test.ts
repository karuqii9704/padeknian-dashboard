import { describe, expect, it } from "vitest";
import { susunNotifVerifikasi } from "./notify";

const dasar = { verifikator: "Pak R Ketua", kegiatan: "Entri Sakernas", tanggal: "2026-10-14" };

describe("susunNotifVerifikasi", () => {
  it("SETUJUI -> tipe VERIFIKASI dengan tautan ke kalender", () => {
    const n = susunNotifVerifikasi({ ...dasar, aksi: "SETUJUI" });
    expect(n).toEqual({
      tipe: "VERIFIKASI",
      judul: "Catatan disetujui",
      isi: 'Catatan "Entri Sakernas" tanggal Rabu, 14 Okt 2026 disetujui oleh Pak R Ketua.',
      link: "/kalender?tanggal=2026-10-14",
    });
  });
  it("MINTA_REVISI -> tipe REVISI, memuat catatan verifikator, tautan ke halaman Revisi", () => {
    const n = susunNotifVerifikasi({ ...dasar, aksi: "MINTA_REVISI", catatan: "Lampirkan foto lokasi." });
    expect(n.tipe).toBe("REVISI");
    expect(n.isi).toContain("diminta revisi oleh Pak R Ketua.");
    expect(n.isi).toContain("Catatan: Lampirkan foto lokasi.");
    expect(n.link).toBe("/revisi");
  });
  it("TOLAK -> judul 'ditolak'", () => {
    const n = susunNotifVerifikasi({ ...dasar, aksi: "TOLAK", catatan: "Bukan bagian alokasi." });
    expect(n.judul).toBe("Catatan ditolak");
    expect(n.isi).toContain("ditolak oleh Pak R Ketua.");
  });
  it("SETUJUI dengan catatan menyertakannya", () => {
    expect(susunNotifVerifikasi({ ...dasar, aksi: "SETUJUI", catatan: "Bagus." }).isi).toContain("Catatan: Bagus.");
  });
});
