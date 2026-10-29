import type { EventLampiran } from "@prisma/client";

/** Bentuk JSON lampiran event untuk klien: tidak pernah memuat object_key atau URL storage. */
export function bentukLampiranEvent(l: EventLampiran) {
  return {
    id: l.id,
    namaAsli: l.namaAsli,
    mimeType: l.mimeType,
    ukuranBytes: Number(l.ukuranBytes),
    checksumSha256: l.checksumSha256,
    uploadedAt: l.uploadedAt.toISOString(),
    // Tautan relatif; otorisasi diperiksa di server lalu diarahkan ke signed URL berumur pendek.
    tautan: `/api/event-lampiran/${l.id}/download`,
  };
}
