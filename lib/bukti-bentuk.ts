import type { BuktiDukung } from "@prisma/client";

/** Bentuk JSON bukti untuk klien: tidak pernah memuat object_key atau URL storage. */
export function bentukBukti(b: BuktiDukung) {
  return {
    id: b.id,
    namaAsli: b.namaAsli,
    mimeType: b.mimeType,
    ukuranBytes: Number(b.ukuranBytes),
    checksumSha256: b.checksumSha256,
    uploadedAt: b.uploadedAt.toISOString(),
    // Tautan relatif; otorisasi diperiksa di server lalu diarahkan ke signed URL berumur pendek.
    tautan: `/api/bukti/${b.id}/download`,
  };
}
