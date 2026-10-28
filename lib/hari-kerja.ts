import { db } from "@/lib/db";
import { hariIni } from "@/lib/clock";
import { formatTanggal, hariKerjaEfektif } from "@/lib/kalender";

type Periode = { id: string; tanggalMulai: Date; tanggalSelesai: Date };

/**
 * Hari kerja efektif periode, dan yang sudah berlalu sampai hari ini (penyebut persentase "hari terisi"
 * untuk periode berjalan; periode yang sudah lewat memakai seluruh hari kerjanya).
 * File ini sengaja bebas dependensi web/auth agar dapat dipakai proses worker.
 */
export async function hariKerjaPeriode(periode: Periode, sekarang = hariIni()) {
  const libur = await db.hariLibur.findMany({ where: { tanggal: { gte: periode.tanggalMulai, lte: periode.tanggalSelesai } } });
  const daftar = hariKerjaEfektif(periode.tanggalMulai, periode.tanggalSelesai, libur.map((l) => formatTanggal(l.tanggal)));
  return { semua: daftar.length, berlalu: daftar.filter((t) => t <= sekarang).length, daftar };
}
