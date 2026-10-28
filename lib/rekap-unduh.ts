import { db } from "@/lib/db";
import { PDF_MIME, XLSX_MIME } from "@/lib/mime";
import { signedDownloadUrl } from "@/lib/storage";
import { namaFileAman } from "@/lib/xlsx-aman";
import { HttpError, type SessionUser } from "@/lib/rbac";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/**
 * Signed URL (<= 15 menit) untuk berkas rekap.
 *  - xlsx: file batch berisi SELURUH pegawai → hanya ADMIN/PIMPINAN (ketua tim tidak boleh melihat data tim lain).
 *  - pdf : per pegawai → ADMIN/PIMPINAN, atau KETUA_TIM bila pegawai anggota timnya pada periode itu.
 */
export async function tautanUnduhRekap(user: SessionUser, rekapId: string, format: "xlsx" | "pdf") {
  const r = await db.rekapSKP.findUnique({
    where: { id: rekapId },
    include: { pegawai: { select: { nama: true } }, periode: { select: { tahun: true, bulan: true } } },
  });
  if (!r) throw new HttpError(404, "Rekap tidak ditemukan.");

  const penuh = user.role === "ADMIN" || user.role === "PIMPINAN";
  if (format === "xlsx" && !penuh) {
    throw new HttpError(403, "File XLSX memuat seluruh pegawai dan hanya dapat diunduh Admin atau Pimpinan.");
  }
  if (!penuh) {
    const anggota = await db.anggotaTim.count({ where: { userId: r.userId, periodeId: r.periodeId, tim: { ketuaId: user.id } } });
    if (anggota === 0) throw new HttpError(404, "Rekap tidak ditemukan.");
  }

  const key = format === "xlsx" ? r.fileXlsxKey : r.filePdfKey;
  if (r.status !== "SELESAI" || !key) {
    throw new HttpError(404, format === "xlsx" ? "File XLSX belum tersedia. Tunggu hingga pembuatan rekap selesai." : "File PDF belum tersedia.");
  }

  const periodeTeks = `${BULAN[r.periode.bulan - 1]}-${r.periode.tahun}`;
  const namaFile =
    format === "xlsx"
      ? namaFileAman(`Rekap-SKP-${periodeTeks}.xlsx`)
      : namaFileAman(`Rekap-SKP-${r.pegawai.nama}-${periodeTeks}-v${r.versi}.pdf`);
  return signedDownloadUrl(key, { namaFile, contentType: format === "xlsx" ? XLSX_MIME : PDF_MIME, inline: false });
}
