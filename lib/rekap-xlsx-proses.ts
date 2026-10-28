import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { putObject } from "@/lib/storage";
import { bangunWorkbookRekap, type BarisRekapBatch } from "@/lib/rekap-xlsx";
import type { RingkasanRekap } from "@/lib/rekap-hitung";
import { XLSX_MIME } from "@/lib/mime";

export function kunciXlsxBatch(tahun: number, bulan: number, batchId: string) {
  return `rekap/${tahun}-${String(bulan).padStart(2, "0")}/${batchId}/rekap.xlsx`;
}

/**
 * Bangun XLSX multi-sheet untuk satu batch begitu seluruh rekap di dalamnya selesai (atau gagal),
 * simpan ke object storage, lalu isi file_xlsx_key pada tiap baris batch. Aman dijalankan ulang.
 */
export async function prosesXlsxBatch(batchId: string) {
  const rows = await db.rekapSKP.findMany({
    where: { batchId },
    include: { pegawai: { select: { nama: true, nip: true } }, periode: { select: { tahun: true, bulan: true } } },
  });
  if (rows.length === 0) return { dibuat: false as const, alasan: "batch tidak ditemukan" };
  if (rows.some((r) => r.status === "QUEUED" || r.status === "PROSES")) return { dibuat: false as const, alasan: "batch belum selesai" };

  const baris: BarisRekapBatch[] = rows.map((r) => ({
    rekapId: r.id,
    versi: r.versi,
    status: r.status,
    errorMessage: r.errorMessage,
    ringkasan: r.status === "SELESAI" ? (r.ringkasanJson as unknown as RingkasanRekap) : null,
    nama: r.pegawai.nama,
    nip: r.pegawai.nip,
  }));
  const { tahun, bulan } = rows[0].periode;
  const wb = bangunWorkbookRekap({ tahun, bulan, dibuatPada: new Date(), baris });
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const key = kunciXlsxBatch(tahun, bulan, batchId);
  await putObject(key, buffer, XLSX_MIME);
  await db.rekapSKP.updateMany({ where: { batchId }, data: { fileXlsxKey: key } });
  logger.info({ batchId, key, ukuran: buffer.length, pegawai: rows.length }, "XLSX rekap dibuat");
  return { dibuat: true as const, key, ukuran: buffer.length };
}
