import { describe, expect, it } from "vitest";
import { buatEventSchema, listEventQuery, ubahEventSchema } from "./event-schema";

const valid = {
  judul: "Rapat koordinasi Susenas",
  jenis: "RAPAT",
  tanggalMulai: "2026-10-14",
  tanggalSelesai: "2026-10-14",
  lokasi: "Ruang rapat BPS Kerinci",
  peran: "Peserta",
  uraianHasil: "Disepakati jadwal pencacahan.",
};

const pesan = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe("buatEventSchema", () => {
  it("menerima input valid dan memangkas spasi", () => {
    const r = buatEventSchema.safeParse({ ...valid, judul: "  Rapat  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.judul).toBe("Rapat");
  });

  it("menerima event satu hari maupun beberapa hari", () => {
    expect(buatEventSchema.safeParse({ ...valid, tanggalSelesai: "2026-10-16" }).success).toBe(true);
  });

  it("menolak tanggal selesai sebelum mulai", () => {
    const r = buatEventSchema.safeParse({ ...valid, tanggalSelesai: "2026-10-13" });
    expect(r.success).toBe(false);
    expect(pesan(r)).toBe("Tanggal selesai tidak boleh sebelum tanggal mulai.");
  });

  it.each([
    ["judul", { judul: "   " }, "Judul event wajib diisi."],
    ["lokasi", { lokasi: "" }, "Lokasi wajib diisi."],
    ["peran", { peran: "" }, "Peran wajib diisi."],
    ["uraianHasil", { uraianHasil: " " }, "Uraian hasil wajib diisi."],
    ["jenis", { jenis: "PESTA" }, "Jenis event tidak valid."],
    ["tanggal", { tanggalMulai: "14-10-2026" }, "Format tanggal harus YYYY-MM-DD."],
  ])("menolak %s tidak valid", (_n, ganti, pesanDiharapkan) => {
    const r = buatEventSchema.safeParse({ ...valid, ...ganti });
    expect(r.success).toBe(false);
    expect(pesan(r)).toBe(pesanDiharapkan);
  });

  it("membatasi panjang judul 200 dan uraian 5000", () => {
    expect(buatEventSchema.safeParse({ ...valid, judul: "a".repeat(201) }).success).toBe(false);
    expect(buatEventSchema.safeParse({ ...valid, judul: "a".repeat(200) }).success).toBe(true);
    expect(buatEventSchema.safeParse({ ...valid, uraianHasil: "a".repeat(5001) }).success).toBe(false);
  });
});

describe("ubahEventSchema", () => {
  it("menolak objek kosong", () => {
    expect(pesan(ubahEventSchema.safeParse({}))).toBe("Tidak ada perubahan yang dikirim.");
  });

  it("menerima perubahan sebagian", () => {
    expect(ubahEventSchema.safeParse({ lokasi: "Aula" }).success).toBe(true);
  });

  it("memeriksa urutan tanggal hanya bila keduanya dikirim", () => {
    expect(ubahEventSchema.safeParse({ tanggalMulai: "2026-10-20" }).success).toBe(true);
    expect(ubahEventSchema.safeParse({ tanggalMulai: "2026-10-20", tanggalSelesai: "2026-10-19" }).success).toBe(false);
  });
});

describe("listEventQuery", () => {
  it("bawaan: cakupan saya, halaman 1, 20 per halaman", () => {
    expect(listEventQuery.parse({})).toMatchObject({ cakupan: "saya", page: 1, pageSize: 20 });
  });

  it("menolak cakupan tidak dikenal dan pageSize > 100", () => {
    expect(listEventQuery.safeParse({ cakupan: "semua" }).success).toBe(false);
    expect(listEventQuery.safeParse({ pageSize: "101" }).success).toBe(false);
  });
});
