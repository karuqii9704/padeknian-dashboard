import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { RingkasanRekap } from "./rekap-hitung";
import { bangunWorkbookRekap, namaSheetUnik, type BarisRekapBatch } from "./rekap-xlsx";

function ringkasan(nama: string, o: Partial<RingkasanRekap> = {}): RingkasanRekap {
  return {
    versiSkema: 1,
    dibuatPada: "2026-10-31T00:00:00.000Z",
    periode: { id: "p", tahun: 2026, bulan: 10, status: "AKTIF" },
    pegawai: { id: nama, nama, nip: "1990", jabatan: "Statistisi" },
    hariKerja: { periode: 21, terisi: 10, terisiDisetujui: 8, persenTerisi: 47.6 },
    alokasi: [
      { alokasiId: "a1", judul: "Entri Sakernas", satuan: "dokumen", prioritas: "TINGGI", statusAlokasi: "AKTIF", target: 50, realisasi: 16, menunggu: 4, persen: 32, jumlahBukti: 2, tanggalPelaksanaan: ["2026-10-13", "2026-10-14"] },
      { alokasiId: "a2", judul: "Pengolahan Susenas", satuan: "blok", prioritas: "SEDANG", statusAlokasi: "AKTIF", target: 20, realisasi: 0, menunggu: 0, persen: 0, jumlahBukti: 0, tanggalPelaksanaan: [] },
    ],
    tugasTambahan: [{ judul: "Rapat", satuan: "kegiatan", realisasi: 2, menunggu: 0, jumlahBukti: 0, tanggalPelaksanaan: ["2026-10-14"] }],
    totalPerSatuan: [
      { satuan: "dokumen", disetujui: 16, menunggu: 4 },
      { satuan: "kegiatan", disetujui: 2, menunggu: 0 },
    ],
    entri: { total: 6, disetujui: 3, menunggu: 1, mintaRevisi: 1, ditolak: 1 },
    jumlahBukti: 2,
    ...o,
  };
}
const baris = (nama: string, o: Partial<BarisRekapBatch> = {}): BarisRekapBatch => ({
  rekapId: nama, versi: 1, status: "SELESAI", errorMessage: null, ringkasan: ringkasan(nama), nama, nip: "1990", ...o,
});
async function muat(wb: ExcelJS.Workbook) {
  const baru = new ExcelJS.Workbook();
  await baru.xlsx.load((await wb.xlsx.writeBuffer()) as unknown as Parameters<typeof baru.xlsx.load>[0]);
  return baru;
}
/** Nomor baris pertama yang sel A-nya sama dengan teks tertentu (penomoran baris ExcelJS dimulai dari 1). */
const nomorBaris = (ws: ExcelJS.Worksheet, teks: string) => {
  let n = 0;
  ws.eachRow((r) => {
    if (!n && r.getCell(1).value === teks) n = r.number;
  });
  return n;
};

describe("namaSheetUnik", () => {
  it("memotong 31 karakter, membuang karakter terlarang, dan menjamin keunikan", () => {
    const dipakai = new Set<string>();
    const a = namaSheetUnik("Dr. Ir. Nama Yang Sangat Panjang Sekali Untuk Excel", dipakai);
    expect(a.length).toBeLessThanOrEqual(31);
    const b = namaSheetUnik("Dr. Ir. Nama Yang Sangat Panjang Sekali Untuk Excel", dipakai);
    expect(b).not.toBe(a);
    expect(b.length).toBeLessThanOrEqual(31);
    expect(b.endsWith("(2)")).toBe(true);
    expect(namaSheetUnik("Budi/Santoso: [A]?", dipakai)).toBe("Budi Santoso A");
  });
  it("tidak bentrok dengan nama 'Ringkasan' tanpa memandang huruf besar-kecil", () => {
    const dipakai = new Set(["ringkasan"]);
    expect(namaSheetUnik("RINGKASAN", dipakai)).toBe("RINGKASAN (2)");
  });
});

describe("bangunWorkbookRekap", () => {
  it("memuat sheet Ringkasan + satu sheet per pegawai (hanya yang selesai)", async () => {
    const wb = await muat(
      bangunWorkbookRekap({
        tahun: 2026, bulan: 10, dibuatPada: new Date("2026-10-31T01:00:00Z"),
        baris: [baris("Yul"), baris("Rina"), baris("Gagal", { status: "GAGAL", errorMessage: "boom", ringkasan: null })],
      }),
    );
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Ringkasan", "Rina", "Yul"]);
    // Pegawai gagal tetap terdaftar di ringkasan beserta alasannya.
    const rows: unknown[][] = [];
    wb.getWorksheet("Ringkasan")!.eachRow((r) => rows.push((r.values as unknown[]).slice(1)));
    const g = rows.find((r) => r[2] === "Gagal")!;
    expect(String(g[13])).toContain("Gagal");
    expect(String(g[13])).toContain("boom");
  });

  it("jumlah baris tabel alokasi = jumlah alokasi pegawai; total per satuan = jumlah realisasi", async () => {
    const wb = await muat(bangunWorkbookRekap({ tahun: 2026, bulan: 10, dibuatPada: new Date(), baris: [baris("Yul")] }));
    const ws = wb.getWorksheet("Yul")!;
    const mulai = nomorBaris(ws, "Alokasi") + 2; // judul bagian, baris header, lalu data
    const barisAlokasi: ExcelJS.Row[] = [];
    for (let n = mulai; n <= ws.rowCount; n++) {
      const r = ws.getRow(n);
      if (typeof r.getCell(1).value !== "number") break;
      barisAlokasi.push(r);
    }
    expect(barisAlokasi).toHaveLength(2);
    const realisasiPerSatuan = new Map<string, number>();
    for (const r of barisAlokasi) realisasiPerSatuan.set(String(r.getCell(3).value), Number(r.getCell(5).value));
    expect(realisasiPerSatuan.get("dokumen")).toBe(16);
    expect(barisAlokasi[0].getCell(6).value).toBeCloseTo(0.32);
    expect(barisAlokasi[0].getCell(9).value).toBe("13 Okt, 14 Okt");
    expect(barisAlokasi[1].getCell(6).value).toBe(0);
  });

  it("nama berformula disimpan sebagai teks dengan awalan '", async () => {
    const wb = await muat(
      bangunWorkbookRekap({ tahun: 2026, bulan: 10, dibuatPada: new Date(), baris: [baris("=HYPERLINK(\"x\")")] }),
    );
    const ringk = wb.getWorksheet("Ringkasan")!;
    let ditemukan = false;
    ringk.eachRow((r) => {
      const v = r.getCell(3).value;
      if (typeof v === "string" && v.includes("HYPERLINK")) {
        ditemukan = true;
        expect(v.startsWith("'=")).toBe(true);
      }
    });
    expect(ditemukan).toBe(true);
    wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => expect(typeof c.value === "object" && c.value !== null && "formula" in (c.value as object)).toBe(false))));
  });

  it("dua pegawai bernama sama mendapat nama sheet berbeda", async () => {
    const wb = await muat(bangunWorkbookRekap({ tahun: 2026, bulan: 10, dibuatPada: new Date(), baris: [baris("Budi", { rekapId: "1" }), baris("Budi", { rekapId: "2" })] }));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Ringkasan", "Budi", "Budi (2)"]);
  });
});
