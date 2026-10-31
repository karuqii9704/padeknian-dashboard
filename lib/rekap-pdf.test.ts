import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import type { RingkasanRekap } from "./rekap-hitung";
import { renderRekapPdf } from "./rekap-pdf";

const contoh: RingkasanRekap = {
  versiSkema: 1,
  dibuatPada: "2026-10-31T01:00:00.000Z",
  periode: { id: "p", tahun: 2026, bulan: 10, status: "AKTIF" },
  pegawai: { id: "u", nama: "Yul Pegawai", nip: "199001012015011001", jabatan: "Statistisi Ahli Pertama" },
  hariKerja: { periode: 21, terisi: 10, terisiDisetujui: 8, persenTerisi: 47.6 },
  alokasi: [
    { alokasiId: "a1", judul: "Entri data Sakernas", satuan: "dokumen", prioritas: "TINGGI", statusAlokasi: "AKTIF", target: 50, realisasi: 16.5, menunggu: 4, persen: 33, jumlahBukti: 2, tanggalPelaksanaan: ["2026-10-13", "2026-10-14"] },
    { alokasiId: "a2", judul: "Pengolahan Susenas", satuan: "blok sensus", prioritas: "SEDANG", statusAlokasi: "AKTIF", target: 20, realisasi: 0, menunggu: 0, persen: 0, jumlahBukti: 0, tanggalPelaksanaan: [] },
  ],
  tugasTambahan: [{ judul: "Rapat koordinasi", satuan: "kegiatan", realisasi: 2, menunggu: 0, jumlahBukti: 1, tanggalPelaksanaan: ["2026-10-14"] }],
  totalPerSatuan: [
    { satuan: "dokumen", disetujui: 16.5, menunggu: 4 },
    { satuan: "kegiatan", disetujui: 2, menunggu: 0 },
  ],
  entri: { total: 6, disetujui: 3, menunggu: 1, mintaRevisi: 1, ditolak: 1 },
  jumlahBukti: 3,
};

async function teks(buf: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const r = await extractText(pdf, { mergePages: true });
  return { teks: r.text, halaman: r.totalPages };
}

describe("renderRekapPdf", () => {
  // Render PDF + parsing teks bisa >5 detik saat mesin sedang sibuk (suite penuh / CI).
  // Timeout default Vitest 5 detik membuat tes ini flaky, bukan karena logika rusak.
  const timeoutMs = 30_000;

  it("menghasilkan PDF A4 valid dengan header instansi, periode, identitas, dan tabel capaian", async () => {
    const buf = await renderRekapPdf(contoh, 3);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const { teks: t, halaman } = await teks(buf);
    expect(halaman).toBe(1);
    for (const x of [
      "BADAN PUSAT STATISTIK", "KABUPATEN KERINCI", "REKAP CAPAIAN KINERJA BULANAN", "Periode Oktober 2026",
      "Yul Pegawai", "199001012015011001", "Statistisi Ahli Pertama",
      "Entri data Sakernas", "Pengolahan Susenas", "Rapat koordinasi",
      "Rekap versi 3", "Halaman 1 dari 1",
    ]) expect(t, x).toContain(x);
  }, timeoutMs);

  it("angka konsisten dengan ringkasan (format Indonesia, koma desimal)", async () => {
    const { teks: t } = await teks(await renderRekapPdf(contoh, 1));
    expect(t).toContain("16,5"); // realisasi desimal
    expect(t).toContain("33%");
    expect(t).toContain("13 Okt, 14 Okt");
    expect(t).toContain("10 dari 21 hari kerja");
    expect(t).toContain("3 dari 6 catatan");
  }, timeoutMs);

  it("alokasi/tugas kosong menampilkan keterangan, bukan tabel rusak", async () => {
    const kosong: RingkasanRekap = { ...contoh, alokasi: [], tugasTambahan: [], totalPerSatuan: [] };
    const { teks: t } = await teks(await renderRekapPdf(kosong, 1));
    expect(t).toContain("Tidak ada alokasi pada periode ini.");
    expect(t).toContain("Tidak ada tugas tambahan.");
    expect(t).toContain("Belum ada capaian.");
  }, timeoutMs);

  it("banyak alokasi memanjang ke beberapa halaman dengan nomor halaman benar", async () => {
    const banyak: RingkasanRekap = {
      ...contoh,
      alokasi: Array.from({ length: 70 }, (_, i) => ({ ...contoh.alokasi[0], alokasiId: `a${i}`, judul: `Kegiatan nomor ${i + 1}` })),
    };
    const { teks: t, halaman } = await teks(await renderRekapPdf(banyak, 1));
    expect(halaman).toBeGreaterThan(1);
    expect(t).toContain(`Halaman 1 dari ${halaman}`);
    expect(t).toContain("Kegiatan nomor 70");
  }, timeoutMs);
});
