// Logika sisi klien untuk unggah bukti: pemeriksaan awal, kompresi gambar, dan pengiriman dengan progres.
import { MAKS_FILE_PER_ENTRI, MAKS_UKURAN_BYTES } from "@/lib/bukti-batas";

const EKSTENSI = ["jpg", "jpeg", "png", "pdf", "docx", "xlsx"];

export const FORMAT_DITERIMA = ".jpg,.jpeg,.png,.pdf,.docx,.xlsx,image/jpeg,image/png,application/pdf";

/** Pemeriksaan cepat di browser. Pemeriksaan sebenarnya (magic bytes) tetap di server. */
export function periksaFileLokal(file: { name: string; size: number }, jumlahSudahAda: number, objek = "catatan"): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!EKSTENSI.includes(ext)) return "Tipe file tidak didukung. Gunakan JPG, PNG, PDF, DOCX, atau XLSX.";
  if (file.size === 0) return "File kosong.";
  if (file.size > MAKS_UKURAN_BYTES) return "Ukuran file melebihi batas 10 MB.";
  if (jumlahSudahAda >= MAKS_FILE_PER_ENTRI) return `Maksimal ${MAKS_FILE_PER_ENTRI} file bukti per ${objek}.`;
  return null;
}

export function tipeTampilan(mime: string): "gambar" | "pdf" | "dokumen" {
  if (mime.startsWith("image/")) return "gambar";
  if (mime === "application/pdf") return "pdf";
  return "dokumen";
}

export function formatUkuran(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const BATAS_KOMPRESI_BYTES = 300 * 1024;
const SISI_MAKS = 1600;

/**
 * Perkecil foto dari kamera sebelum unggah (maks 1600px, JPEG). Bila gagal atau hasil tidak lebih kecil,
 * file asli dipakai. File non-gambar dan gambar kecil tidak disentuh.
 */
export async function kompresGambar(file: File): Promise<File> {
  if (!/^image\/(jpeg|png)$/.test(file.type) || file.size <= BATAS_KOMPRESI_BYTES) return file;
  try {
    const bmp = await createImageBitmap(file);
    const skala = Math.min(1, SISI_MAKS / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * skala));
    const h = Math.max(1, Math.round(bmp.height * skala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // PNG transparan -> latar putih saat menjadi JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    const nama = file.name.replace(/\.(png|jpe?g)$/i, "") + ".jpg";
    return new File([blob], nama, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export type HasilUnggah = { ok: true; id?: string; sudahAda?: boolean } | { ok: false; pesan: string; jaringan?: boolean };

/** Alamat unggah bukti untuk satu entri pekerjaan harian (bawaan). */
export const urlUnggahBukti = (entriId: string) => `/api/pekerjaan-harian/${entriId}/bukti`;

/** Kirim satu file dengan progres (fetch belum mendukung progres unggah). `urlUnggah` bisa diganti, mis. untuk lampiran event. */
export function unggahDenganProgres(
  entriId: string,
  file: File,
  onProgress: (persen: number) => void,
  urlUnggah: (id: string) => string = urlUnggahBukti,
): Promise<HasilUnggah> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", urlUnggah(entriId));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => resolve({ ok: false, jaringan: true, pesan: "Koneksi terputus. Periksa jaringan lalu coba lagi." });
    xhr.ontimeout = () => resolve({ ok: false, jaringan: true, pesan: "Waktu unggah habis. Coba lagi." });
    xhr.onload = () => {
      let body: { pesan?: string; bukti?: { id: string }; lampiran?: { id: string } } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* abaikan */
      }
      if (xhr.status === 201) return resolve({ ok: true, id: body.bukti?.id ?? body.lampiran?.id });
      // Percobaan ulang setelah koneksi putus di tengah jalan: file yang sama sudah tersimpan -> anggap sukses.
      if (xhr.status === 409 && body.pesan?.includes("sudah dilampirkan")) return resolve({ ok: true, sudahAda: true });
      resolve({ ok: false, pesan: body.pesan ?? "Gagal mengunggah file." });
    };
    xhr.timeout = 120_000;
    const form = new FormData();
    form.append("file", file, file.name);
    xhr.send(form);
  });
}
