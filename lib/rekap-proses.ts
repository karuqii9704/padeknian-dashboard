import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { hitungRingkasanRekap } from "@/lib/rekap-hitung";
import { kirimJobXlsx } from "@/lib/queue";
import { PDF_MIME } from "@/lib/mime";
import { renderRekapPdf } from "@/lib/rekap-pdf";
import { putObject } from "@/lib/storage";

export function kunciPdfRekap(tahun: number, bulan: number, batchId: string, rekapId: string) {
  return `rekap/${tahun}-${String(bulan).padStart(2, "0")}/${batchId}/pdf/${rekapId}.pdf`;
}

/**
 * Proses satu job rekap. Tidak pernah melempar: kegagalan disimpan sebagai status GAGAL + error_message
 * agar job lain dalam batch yang sama tidak ikut berhenti.
 */
/** Bila tidak ada lagi rekap QUEUED/PROSES dalam batch, antrekan pembuatan XLSX batch. */
async function picuXlsxBilaBatchSelesai(batchId: string) {
  const sisa = await db.rekapSKP.count({ where: { batchId, status: { in: ["QUEUED", "PROSES"] } } });
  if (sisa > 0) return;
  try {
    await kirimJobXlsx(batchId);
  } catch (e) {
    logger.error({ err: e, batchId }, "gagal mengantrekan XLSX batch");
  }
}

export async function prosesRekap(rekapId: string) {
  const rekap = await db.rekapSKP.findUnique({ where: { id: rekapId }, include: { pegawai: { select: { nip: true } }, periode: { select: { tahun: true, bulan: true } } } });
  if (!rekap) {
    logger.warn({ rekapId }, "job rekap untuk rekap yang tidak ada diabaikan");
    return;
  }
  if (rekap.status === "SELESAI") return; // idempoten bila job terkirim ulang

  await db.rekapSKP.update({ where: { id: rekapId }, data: { status: "PROSES", errorMessage: null } });
  try {
    // Kait uji: memaksa kegagalan untuk NIP tertentu (diabaikan di produksi).
    if (process.env.NODE_ENV !== "production" && process.env.REKAP_GAGALKAN_NIP === rekap.pegawai.nip) {
      throw new Error("Kegagalan disimulasikan untuk pengujian.");
    }
    const ringkasan = await hitungRingkasanRekap(db, rekap.periodeId, rekap.userId);
    // PDF dibuat dari ringkasan yang sama dengan yang disimpan (konsisten dengan XLSX), lalu disimpan ke storage privat.
    const pdf = await renderRekapPdf(ringkasan, rekap.versi);
    const keyPdf = kunciPdfRekap(rekap.periode.tahun, rekap.periode.bulan, rekap.batchId, rekap.id);
    await putObject(keyPdf, pdf, PDF_MIME);
    await db.rekapSKP.update({
      where: { id: rekapId },
      data: { status: "SELESAI", ringkasanJson: ringkasan as object, filePdfKey: keyPdf, finishedAt: new Date(), errorMessage: null },
    });
    await picuXlsxBilaBatchSelesai(rekap.batchId);
  } catch (e) {
    logger.error({ err: e, rekapId }, "rekap gagal diproses");
    await db.rekapSKP.update({
      where: { id: rekapId },
      data: { status: "GAGAL", errorMessage: (e instanceof Error ? e.message : String(e)).slice(0, 1000), finishedAt: new Date() },
    });
    await picuXlsxBilaBatchSelesai(rekap.batchId);
  }
}
