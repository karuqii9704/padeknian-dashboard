import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { ringkasanKpi } from "@/lib/dashboard";
import { tabelPegawai, type PegawaiQuery } from "@/lib/dashboard-pegawai";
import { amanSel, namaFileAman } from "@/lib/xlsx-aman";
import { putObject, signedDownloadUrl } from "@/lib/storage";
import { labelTanggal } from "@/lib/tanggal-id";
import type { SessionUser } from "@/lib/rbac";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const AKSI = { SETUJUI: "Disetujui", MINTA_REVISI: "Diminta revisi", TOLAK: "Ditolak" } as Record<string, string>;
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const fmt = (n: number) => String(n).replace(".", ",");

/** Susun workbook snapshot dashboard sesuai filter aktif. */
export async function bangunWorkbook(user: SessionUser, q: PegawaiQuery) {
  const [ringkasan, tabel, pengguna, tim] = await Promise.all([
    ringkasanKpi(user, q),
    tabelPegawai(user, q),
    db.user.findUnique({ where: { id: user.id }, select: { nama: true } }),
    q.timId ? db.timKerja.findUnique({ where: { id: q.timId }, select: { nama: true } }) : Promise.resolve(null),
  ]);
  if (!ringkasan || !tabel) return null;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Dashboard Pekerjaan Harian BPS Kabupaten Kerinci";
  wb.created = new Date();

  const periodeTeks = `${BULAN[ringkasan.periode.bulan - 1]} ${ringkasan.periode.tahun}`;
  const timTeks = tim?.nama ?? (ringkasan.tim.map((t) => t.nama).join(", ") || "Semua tim");

  // --- Sheet 1: per pegawai ---
  const ws = wb.addWorksheet("Per Pegawai");
  ws.addRow(["Snapshot Dashboard — Ringkasan per Pegawai"]).font = { bold: true, size: 13 };
  ws.addRow(["Periode", periodeTeks]);
  ws.addRow(["Tim", amanSel(timTeks)]);
  ws.addRow(["Hari kerja berjalan", `${tabel.hariKerja.berlalu} dari ${tabel.hariKerja.periode}`]);
  ws.addRow(["Dibuat oleh", amanSel(pengguna?.nama)]);
  ws.addRow(["Dibuat pada", labelTanggal(ringkasan.hariIni)]);
  ws.addRow([]);
  const header = ws.addRow(["No", "NIP", "Nama", "Tim", "Jumlah Entri", "Volume (semua satuan)", "Volume Disetujui", "Hari Terisi", "% Hari Terisi", "Belum Diverifikasi", "Verifikasi Terakhir"]);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    c.border = { bottom: { style: "thin" } };
  });
  tabel.data.forEach((r, i) => {
    ws.addRow([
      i + 1,
      amanSel(r.nip),
      amanSel(r.nama),
      amanSel(r.tim.join(", ")),
      r.jumlahEntri,
      amanSel(r.volumePerSatuan.map((v) => `${fmt(v.total)} ${v.satuan}`).join("; ") || "-"),
      amanSel(r.volumePerSatuan.map((v) => `${fmt(v.disetujui)} ${v.satuan}`).join("; ") || "-"),
      r.hariTerisi,
      r.persenHariTerisi === null ? "-" : r.persenHariTerisi / 100,
      r.entriMenunggu,
      r.verifikasiTerakhir ? `${AKSI[r.verifikasiTerakhir.aksi]} (${r.verifikasiTerakhir.waktu.slice(0, 10)})` : "Belum ada",
    ]);
  });
  ws.getColumn(9).numFmt = "0.0%";
  [6, 12, 10, 28, 24, 22, 22, 12, 14, 18, 26].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: header.number }];

  // --- Sheet 2: KPI ---
  const wk = wb.addWorksheet("Ringkasan KPI");
  wk.addRow(["Indikator", "Nilai", "Keterangan"]).font = { bold: true };
  const k = ringkasan.kpi;
  wk.addRows([
    ["Pegawai aktif", k.pegawaiAktif, ""],
    ["Alokasi periode ini", k.alokasiPeriodeIni, "Tidak termasuk alokasi dibatalkan"],
    ["Entri terisi hari ini", k.entriTerisiHariIni, `${k.pegawaiMengisiHariIni} pegawai mengisi`],
    ["Entri menunggu verifikasi", k.entriMenungguVerifikasi, ""],
    ["Entri berbukti", k.persenEntriBerbukti === null ? "-" : k.persenEntriBerbukti / 100, `${k.entriBerbukti} dari ${k.totalEntri} entri`],
  ]);
  wk.getColumn(2).numFmt = "General";
  wk.getCell("B6").numFmt = "0.0%";
  [30, 14, 40].forEach((w, i) => (wk.getColumn(i + 1).width = w));

  const namaFile = namaFileAman(`Dashboard-${periodeTeks}-${timTeks}.xlsx`);
  return { wb, namaFile, jumlahBaris: tabel.data.length };
}

/**
 * Buat XLSX, simpan ke object storage privat, kembalikan signed URL (<= 15 menit).
 * Berjalan async tanpa memblokir event loop untuk pekerjaan lain.
 */
export async function eksporDashboard(user: SessionUser, q: PegawaiQuery, ip: string | null) {
  const hasil = await bangunWorkbook(user, q);
  if (!hasil) return null;
  const buffer = Buffer.from(await hasil.wb.xlsx.writeBuffer());
  const key = `ekspor/dashboard/${user.id}/${randomUUID()}.xlsx`;
  await putObject(key, buffer, XLSX_MIME);
  const url = await signedDownloadUrl(key, { namaFile: hasil.namaFile, contentType: XLSX_MIME, inline: false });
  await tulisAudit({
    userId: user.id,
    aksi: "EKSPOR_DASHBOARD",
    entitas: "Dashboard",
    metadata: { periodeId: q.periodeId ?? null, timId: q.timId ?? null, userId: q.userId ?? null, baris: hasil.jumlahBaris, ukuranBytes: buffer.length },
    ipAddress: ip,
  });
  return { url, namaFile: hasil.namaFile, jumlahBaris: hasil.jumlahBaris, ukuranBytes: buffer.length };
}
