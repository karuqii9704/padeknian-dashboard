import ExcelJS from "exceljs";
import type { RingkasanRekap } from "@/lib/rekap-hitung";
import { tanggalSingkat } from "@/lib/tanggal-id";
import { amanSel, namaSheet } from "@/lib/xlsx-aman";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export type BarisRekapBatch = {
  rekapId: string;
  versi: number;
  status: "QUEUED" | "PROSES" | "SELESAI" | "GAGAL";
  errorMessage: string | null;
  ringkasan: RingkasanRekap | null;
  nama: string; // dipakai bila ringkasan tidak ada (GAGAL)
  nip: string;
};

const STATUS_TEKS: Record<string, string> = { QUEUED: "Dalam antrean", PROSES: "Diproses", SELESAI: "Selesai", GAGAL: "Gagal" };

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const perSatuan = (xs: { satuan: string; v: number }[]) => xs.filter((x) => x.v !== 0).map((x) => `${fmt(x.v)} ${x.satuan}`).join("; ") || "-";
const tanggalTeks = (ts: string[]) => ts.map(tanggalSingkat).join(", ") || "-";

/** Nama sheet unik (maks 31 karakter, tanpa karakter terlarang). */
export function namaSheetUnik(nama: string, dipakai: Set<string>) {
  let dasar = namaSheet(nama);
  let calon = dasar;
  for (let i = 2; dipakai.has(calon.toLowerCase()); i++) {
    const akhiran = ` (${i})`;
    calon = dasar.slice(0, 31 - akhiran.length) + akhiran;
  }
  dasar = calon;
  dipakai.add(dasar.toLowerCase());
  return dasar;
}

const judul = (ws: ExcelJS.Worksheet, teks: string) => {
  const r = ws.addRow([teks]);
  r.font = { bold: true, size: 13 };
  return r;
};
const header = (ws: ExcelJS.Worksheet, kolom: string[]) => {
  const r = ws.addRow(kolom);
  r.font = { bold: true };
  r.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    c.border = { bottom: { style: "thin" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  return r;
};

/**
 * Workbook rekap satu batch: sheet "Ringkasan" (semua pegawai) + satu sheet detail per pegawai.
 * Baris sheet pegawai = jumlah alokasi pegawai itu; total per satuan = jumlah volume entri DISETUJUI.
 */
export function bangunWorkbookRekap(o: { tahun: number; bulan: number; dibuatPada: Date; baris: BarisRekapBatch[] }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dashboard Pekerjaan Harian BPS Kabupaten Kerinci";
  wb.created = o.dibuatPada;
  const periodeTeks = `${BULAN[o.bulan - 1]} ${o.tahun}`;
  const dibuat = o.dibuatPada.toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" });

  const urut = [...o.baris].sort((a, b) => (a.ringkasan?.pegawai.nama ?? a.nama).localeCompare(b.ringkasan?.pegawai.nama ?? b.nama));
  const dipakai = new Set<string>(["ringkasan"]);

  // --- Sheet ringkasan ---
  const wr = wb.addWorksheet("Ringkasan");
  judul(wr, `Rekap Capaian Bulanan — ${periodeTeks}`);
  wr.addRow(["Dibuat", dibuat]);
  wr.addRow(["Catatan", "Hanya catatan berstatus Disetujui yang dihitung sebagai capaian."]);
  wr.addRow([]);
  const hr = header(wr, [
    "No", "NIP", "Nama", "Jumlah Alokasi", "Realisasi Disetujui", "Menunggu Verifikasi", "Hari Terisi", "% Hari Terisi",
    "Entri Disetujui", "Entri Menunggu", "Perlu Revisi", "Ditolak", "Jumlah Bukti", "Status Rekap",
  ]);
  urut.forEach((b, i) => {
    const r = b.ringkasan;
    if (!r) {
      wr.addRow([i + 1, amanSel(b.nip), amanSel(b.nama), "-", "-", "-", "-", "-", "-", "-", "-", "-", "-", STATUS_TEKS[b.status] + (b.errorMessage ? `: ${amanSel(b.errorMessage)}` : "")]);
      return;
    }
    wr.addRow([
      i + 1, amanSel(r.pegawai.nip), amanSel(r.pegawai.nama), r.alokasi.length,
      amanSel(perSatuan(r.totalPerSatuan.map((t) => ({ satuan: t.satuan, v: t.disetujui })))),
      amanSel(perSatuan(r.totalPerSatuan.map((t) => ({ satuan: t.satuan, v: t.menunggu })))),
      r.hariKerja.terisi, r.hariKerja.persenTerisi === null ? "-" : r.hariKerja.persenTerisi / 100,
      r.entri.disetujui, r.entri.menunggu, r.entri.mintaRevisi, r.entri.ditolak, r.jumlahBukti, STATUS_TEKS[b.status],
    ]);
  });
  wr.getColumn(8).numFmt = "0.0%";
  [5, 20, 28, 14, 26, 26, 12, 14, 14, 14, 12, 10, 14, 22].forEach((w, i) => (wr.getColumn(i + 1).width = w));
  wr.views = [{ state: "frozen", ySplit: hr.number }];

  // --- Sheet detail per pegawai ---
  for (const b of urut) {
    const r = b.ringkasan;
    if (!r) continue;
    const ws = wb.addWorksheet(namaSheetUnik(r.pegawai.nama, dipakai));
    judul(ws, "Rekap Capaian Bulanan");
    ws.addRow(["Nama", amanSel(r.pegawai.nama)]);
    ws.addRow(["NIP", amanSel(r.pegawai.nip)]);
    ws.addRow(["Jabatan", amanSel(r.pegawai.jabatan)]);
    ws.addRow(["Periode", periodeTeks]);
    ws.addRow(["Versi rekap", b.versi]);
    ws.addRow(["Hari terisi", `${r.hariKerja.terisi} dari ${r.hariKerja.periode} hari kerja`]);
    ws.addRow([]);

    judul(ws, "Alokasi");
    header(ws, ["No", "Alokasi", "Satuan", "Target", "Realisasi (Disetujui)", "% Capaian", "Menunggu Verifikasi", "Jumlah Bukti", "Tanggal Pelaksanaan"]);
    r.alokasi.forEach((a, i) => {
      const baris = ws.addRow([
        i + 1, amanSel(a.judul + (a.statusAlokasi === "DIBATALKAN" ? " (dibatalkan)" : "")), amanSel(a.satuan), a.target, a.realisasi,
        a.persen === null ? "-" : a.persen / 100, a.menunggu, a.jumlahBukti, tanggalTeks(a.tanggalPelaksanaan),
      ]);
      baris.getCell(6).numFmt = "0.0%";
    });
    ws.addRow([]);

    judul(ws, "Tugas Tambahan");
    header(ws, ["No", "Tugas", "Satuan", "", "Realisasi (Disetujui)", "", "Menunggu Verifikasi", "Jumlah Bukti", "Tanggal Pelaksanaan"]);
    if (r.tugasTambahan.length === 0) ws.addRow(["", "(tidak ada)"]);
    r.tugasTambahan.forEach((t, i) => ws.addRow([i + 1, amanSel(t.judul), amanSel(t.satuan), "", t.realisasi, "", t.menunggu, t.jumlahBukti, tanggalTeks(t.tanggalPelaksanaan)]));
    ws.addRow([]);

    judul(ws, "Total per Satuan");
    header(ws, ["", "Satuan", "", "", "Disetujui", "", "Menunggu"]);
    r.totalPerSatuan.forEach((t) => ws.addRow(["", amanSel(t.satuan), "", "", t.disetujui, "", t.menunggu]));

    [5, 40, 14, 12, 22, 12, 20, 14, 36].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  }
  return wb;
}
