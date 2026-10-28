import { fileTypeFromBuffer } from "file-type";

import { MAKS_UKURAN_BYTES } from "@/lib/bukti-batas";

export { MAKS_FILE_PER_ENTRI, MAKS_UKURAN_BYTES } from "@/lib/bukti-batas";

/** Tipe yang diizinkan (FR-25): MIME hasil deteksi magic bytes -> ekstensi object key. */
export const TIPE_DIIZINKAN: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export type HasilValidasiFile =
  | { ok: true; mime: string; ext: string }
  | { ok: false; status: 400 | 413; pesan: string };

const PESAN_TIPE = "Tipe file tidak didukung. Gunakan JPG, PNG, PDF, DOCX, atau XLSX.";

/**
 * Validasi isi file (bukan sekadar ekstensi): ukuran, MIME yang dideklarasikan browser,
 * dan tipe asli dari magic bytes. File .exe yang dinamai .pdf ditolak karena isinya bukan PDF.
 */
export async function validasiFileBukti(input: {
  bytes: Uint8Array;
  tipeDeklarasi?: string;
}): Promise<HasilValidasiFile> {
  if (input.bytes.byteLength === 0) return { ok: false, status: 400, pesan: "File kosong." };
  if (input.bytes.byteLength > MAKS_UKURAN_BYTES) {
    return { ok: false, status: 413, pesan: "Ukuran file melebihi batas 10 MB." };
  }

  const deklarasi = (input.tipeDeklarasi ?? "").toLowerCase().trim();
  const deklarasiNormal = deklarasi === "image/jpg" ? "image/jpeg" : deklarasi;
  if (deklarasiNormal && deklarasiNormal !== "application/octet-stream" && !(deklarasiNormal in TIPE_DIIZINKAN)) {
    return { ok: false, status: 400, pesan: PESAN_TIPE };
  }

  const terdeteksi = await fileTypeFromBuffer(input.bytes);
  if (!terdeteksi || !(terdeteksi.mime in TIPE_DIIZINKAN)) {
    return { ok: false, status: 400, pesan: "Isi file tidak sesuai tipe yang diizinkan (JPG, PNG, PDF, DOCX, XLSX)." };
  }
  if (deklarasiNormal && deklarasiNormal !== "application/octet-stream" && deklarasiNormal !== terdeteksi.mime) {
    return { ok: false, status: 400, pesan: "Isi file tidak sesuai dengan tipe yang dinyatakan." };
  }
  return { ok: true, mime: terdeteksi.mime, ext: TIPE_DIIZINKAN[terdeteksi.mime] };
}

/** Bersihkan nama file dari pengguna: buang path, karakter kontrol/berbahaya; batasi 255 karakter. */
export function sanitasiNamaFile(nama: string) {
  const dasar = nama.split(/[\\/]/).pop() ?? "";
  let bersih = dasar.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim().replace(/^\.+/, "").replace(/\.+$/, "");
  if (!bersih) bersih = "berkas";
  if (bersih.length > 255) {
    const titik = bersih.lastIndexOf(".");
    const ext = titik > 0 && bersih.length - titik <= 10 ? bersih.slice(titik) : "";
    bersih = bersih.slice(0, 255 - ext.length) + ext;
  }
  return bersih;
}

/** Format: periode/YYYY-MM/userId/uuid.ext */
export function buatObjectKey(opts: { tahun: number; bulan: number; userId: string; uuid: string; ext: string }) {
  return `periode/${opts.tahun}-${String(opts.bulan).padStart(2, "0")}/${opts.userId}/${opts.uuid}.${opts.ext}`;
}
