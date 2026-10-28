// Penyusunan jalur & manifest ZIP bukti dukung (murni, tanpa I/O) agar mudah diuji.

export const MAKS_ZIP_BYTES = 500 * 1024 * 1024;

/** Satu segmen jalur yang aman untuk dalam ZIP: tanpa pemisah path, karakter kontrol, atau titik di ujung. */
export function segmenAman(teks: string, maks = 80) {
  const bersih = teks
    .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, " ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return (bersih || "tanpa-nama").slice(0, maks).trim();
}

export type ItemZip = {
  buktiId: string;
  tanggal: string; // YYYY-MM-DD
  kegiatan: string; // judul alokasi atau "Tugas Tambahan - <judul>"
  namaFile: string;
};

/** Jalur `<akar>/<tanggal>/<kegiatan>/<nama file>`; nama kembar diberi akhiran (2), (3), ... */
export function susunJalurZip(akar: string, items: ItemZip[]): Map<string, string> {
  const dipakai = new Set<string>();
  const hasil = new Map<string, string>();
  for (const it of items) {
    const dasar = `${segmenAman(akar)}/${it.tanggal}/${segmenAman(it.kegiatan)}`;
    const nama = segmenAman(it.namaFile, 120);
    const titik = nama.lastIndexOf(".");
    const pokok = titik > 0 ? nama.slice(0, titik) : nama;
    const ext = titik > 0 ? nama.slice(titik) : "";
    let calon = `${dasar}/${pokok}${ext}`;
    for (let i = 2; dipakai.has(calon.toLowerCase()); i++) calon = `${dasar}/${pokok} (${i})${ext}`;
    dipakai.add(calon.toLowerCase());
    hasil.set(it.buktiId, calon);
  }
  return hasil;
}

const cegahRumus = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const sel = (s: string | number) => `"${cegahRumus(String(s)).replace(/"/g, '""')}"`;

export type BarisManifest = {
  jalur: string;
  tanggal: string;
  kegiatan: string;
  deskripsi: string;
  statusVerifikasi: string;
  ukuranBytes: number;
  checksumSha256: string;
  catatan?: string;
};

/** CSV manifest (BOM UTF-8 agar terbaca benar di Excel). Sel diberi pengaman terhadap formula injection. */
export function buatManifestCsv(baris: BarisManifest[]) {
  const kepala = ["Jalur di ZIP", "Tanggal", "Kegiatan", "Deskripsi capaian", "Status verifikasi", "Ukuran (byte)", "SHA-256", "Catatan"];
  const isi = baris.map((b) => [b.jalur, b.tanggal, b.kegiatan, b.deskripsi, b.statusVerifikasi, b.ukuranBytes, b.checksumSha256, b.catatan ?? ""].map(sel).join(","));
  return "﻿" + [kepala.map(sel).join(","), ...isi].join("\r\n") + "\r\n";
}

export function formatMb(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1).replace(".", ",");
}

/** Pesan penolakan bila total ukuran bukti melebihi batas ZIP; null bila masih dalam batas. */
export function pesanZipTerlaluBesar(totalBytes: number) {
  if (totalBytes <= MAKS_ZIP_BYTES) return null;
  return `Total ukuran bukti dukung ${formatMb(totalBytes)} MB melebihi batas unduhan ZIP ${formatMb(MAKS_ZIP_BYTES)} MB. Unduh bukti per catatan harian, atau minta Admin memecah unduhan per rentang tanggal.`;
}
