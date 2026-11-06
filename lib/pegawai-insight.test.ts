import { describe, expect, it } from "vitest";
import { hitungInsight, type BarisPegawai, type RingkasanPegawai } from "./pegawai-insight";

/**
 * Test untuk logika insight "Informasi Pegawai". Fungsi murni (tanpa DB) sehingga mudah diuji.
 */

const ringkasanDasar: RingkasanPegawai = {
  total: 3,
  aktif: 3,
  nonaktif: 0,
  wajibGantiPassword: 0,
  belumPernahLogin: 0,
  perPeran: [{ role: "PEGAWAI", label: "Pegawai", jumlah: 3, aktif: 3 }],
};

function baris(over: Partial<BarisPegawai> = {}): BarisPegawai {
  return {
    userId: "u1",
    nama: "Budi",
    nip: "123",
    role: "PEGAWAI",
    jabatan: null,
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: "2026-10-01T00:00:00.000Z",
    tim: [],
    jumlahEntri: 0,
    hariKerjaBerlalu: 10,
    hariTerisi: 0,
    persenHariTerisi: null,
    entriMenunggu: 0,
    entriDisetujui: 0,
    entriRevisi: 0,
    totalBukti: 0,
    hariTerakhir: null,
    ...over,
  };
}

const kosong = [
  { status: "DISETUJUI", label: "Disetujui", jumlah: 0 },
  { status: "MENUNGGU", label: "Menunggu verifikasi", jumlah: 0 },
  { status: "MINTA_REVISI", label: "Perlu revisi", jumlah: 0 },
];

/** Ganti jumlah satu status pada daftar sebaran (meniru data nyata dari DB). */
const dengan = (status: string, jumlah: number) =>
  kosong.map((s) => (s.status === status ? { ...s, jumlah } : s));

describe("hitungInsight", () => {
  it("menyoroti antrean verifikasi yang menumpuk sebagai galat", () => {
    const i = hitungInsight(
      ringkasanDasar,
      [baris({ jumlahEntri: 25, entriMenunggu: 25 })],
      dengan("MENUNGGU", 25),
    );
    const antrean = i.find((x) => /menunggu verifikasi/i.test(x.judul));
    expect(antrean).toBeDefined();
    expect(antrean!.tingkat).toBe("galat");
  });

  it("menyoroti antrean verifikasi kecil sebagai peringatan", () => {
    const i = hitungInsight(
      ringkasanDasar,
      [baris({ jumlahEntri: 3, entriMenunggu: 3 })],
      dengan("MENUNGGU", 3),
    );
    const antrean = i.find((x) => /menunggu verifikasi/i.test(x.judul));
    expect(antrean!.tingkat).toBe("peringatan");
  });

  it("mendeteksi pegawai yang belum mengisi laporan sama sekali", () => {
    const i = hitungInsight(ringkasanDasar, [baris({ jumlahEntri: 0, hariKerjaBerlalu: 10 })], kosong);
    const belum = i.find((x) => /belum mengisi laporan/i.test(x.judul));
    expect(belum).toBeDefined();
    expect(belum!.judul).toContain("1 pegawai");
  });

  it("admin, pimpinan, dan akun nonaktif tidak dihitung 'belum mengisi' maupun 'di bawah 50%'", () => {
    const rows = [
      baris({ userId: "a", nama: "Admin", role: "ADMIN" }),
      baris({ userId: "p", nama: "Pimpinan", role: "PIMPINAN", jumlahEntri: 1, persenHariTerisi: 10 }),
      baris({ userId: "n", nama: "Nonaktif", isActive: false }),
      baris({ userId: "k", nama: "Ketua", role: "KETUA_TIM" }),
    ];
    const i = hitungInsight(ringkasanDasar, rows, kosong);
    const belum = i.find((x) => /belum mengisi laporan/i.test(x.judul));
    expect(belum!.judul).toContain("1 pegawai");
    expect(belum!.keterangan).toContain("Ketua");
    expect(belum!.keterangan).not.toMatch(/Admin|Pimpinan|Nonaktif/);
    expect(i.some((x) => /di bawah 50%/i.test(x.judul))).toBe(false);
  });

  it("mendeteksi kelengkapan pengisian di bawah 50%", () => {
    const i = hitungInsight(
      ringkasanDasar,
      [baris({ jumlahEntri: 3, hariKerjaBerlalu: 10, hariTerisi: 3, persenHariTerisi: 30 })],
      kosong,
    );
    expect(i.some((x) => /di bawah 50%/i.test(x.judul))).toBe(true);
  });

  it("memperingatkan password sementara yang belum diganti", () => {
    const i = hitungInsight(
      { ...ringkasanDasar, wajibGantiPassword: 2 },
      [baris()],
      kosong,
    );
    expect(i.some((x) => /password sementara/i.test(x.judul))).toBe(true);
  });

  it("memberi pesan informatif bila belum ada aktivitas sama sekali", () => {
    const i = hitungInsight(ringkasanDasar, [baris()], kosong);
    expect(i.some((x) => /belum ada aktivitas/i.test(x.judul))).toBe(true);
  });

  it("menyusun insight urut berdasarkan prioritas (galat di atas info)", () => {
    const i = hitungInsight(
      { ...ringkasanDasar, wajibGantiPassword: 1 },
      [baris({ jumlahEntri: 0, hariKerjaBerlalu: 10 })],
      dengan("MENUNGGU", 30),
    );
    const prioritas = i.map((x) => x.prioritas);
    expect([...prioritas].sort((a, b) => b - a)).toEqual(prioritas);
    expect(i[0].tingkat).toBe("galat");
  });

  it("tidak menghasilkan insight ganda untuk kondisi yang sama", () => {
    const i = hitungInsight(ringkasanDasar, [baris({ jumlahEntri: 0, hariKerjaBerlalu: 0 })], kosong);
    // Tanpa hari kerja berjalan, pegawai tidak dilaporkan "belum mengisi".
    expect(i.some((x) => /belum mengisi laporan/i.test(x.judul))).toBe(false);
  });
});