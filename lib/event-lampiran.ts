import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { MAKS_FILE_PER_ENTRI, buatObjectKeyEvent, sanitasiNamaFile, validasiFileBukti } from "@/lib/bukti-file";
import { bentukLampiranEvent } from "@/lib/event-bentuk";
import { bolehLihatEvent, muatEventUntukUbah } from "@/lib/event";
import { deleteObject, putObject, signedDownloadUrl } from "@/lib/storage";
import { HttpError, type SessionUser } from "@/lib/rbac";

export type ServiceError = { ok: false; status: 400 | 403 | 404 | 409 | 413 | 502; pesan: string };
const fail = (status: ServiceError["status"], pesan: string): ServiceError => ({ ok: false, status, pesan });

const PESAN_KEMBAR = "File yang sama sudah dilampirkan pada event ini.";

/** Hapus objek dari storage; kegagalan dicatat (tidak menggagalkan permintaan yang DB-nya sudah berubah). */
async function bersihkanObjek(key: string) {
  try {
    await deleteObject(key);
  } catch (e) {
    logger.error({ err: e, key }, "gagal menghapus objek lampiran event dari storage (yatim)");
  }
}

export async function unggahLampiran(user: SessionUser, eventId: string, file: { nama: string; tipe: string; bytes: Uint8Array }) {
  // Aturan sama dengan mengubah event: milik sendiri dan periode belum dikunci.
  const event = await muatEventUntukUbah(user, eventId);

  const v = await validasiFileBukti({ bytes: file.bytes, tipeDeklarasi: file.tipe });
  if (!v.ok) return fail(v.status, v.pesan);

  if (event.lampiran.length >= MAKS_FILE_PER_ENTRI) return fail(409, `Maksimal ${MAKS_FILE_PER_ENTRI} file lampiran per event.`);

  const checksum = createHash("sha256").update(file.bytes).digest("hex");
  const kembar = await db.eventLampiran.findUnique({ where: { eventId_checksumSha256: { eventId, checksumSha256: checksum } } });
  if (kembar) return fail(409, PESAN_KEMBAR);

  const objectKey = buatObjectKeyEvent({ tahun: event.periode.tahun, bulan: event.periode.bulan, userId: user.id, uuid: randomUUID(), ext: v.ext });
  try {
    await putObject(objectKey, file.bytes, v.mime);
  } catch (e) {
    logger.error({ err: e, eventId }, "gagal menyimpan lampiran event ke object storage");
    return fail(502, "Penyimpanan lampiran sedang bermasalah. Coba lagi beberapa saat.");
  }

  try {
    const lampiran = await db.eventLampiran.create({
      data: {
        eventId,
        namaAsli: sanitasiNamaFile(file.nama),
        objectKey,
        mimeType: v.mime,
        ukuranBytes: BigInt(file.bytes.byteLength),
        checksumSha256: checksum,
        uploadedById: user.id,
      },
    });
    return { ok: true as const, lampiran: bentukLampiranEvent(lampiran) };
  } catch (e) {
    await bersihkanObjek(objectKey); // jangan tinggalkan objek yatim
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail(409, PESAN_KEMBAR);
    throw e;
  }
}

export async function hapusLampiran(user: SessionUser, lampiranId: string, ip: string | null) {
  const l = await db.eventLampiran.findUnique({ where: { id: lampiranId } });
  if (!l) throw new HttpError(404, "Lampiran tidak ditemukan.");
  await muatEventUntukUbah(user, l.eventId);
  await db.eventLampiran.delete({ where: { id: l.id } });
  await bersihkanObjek(l.objectKey);
  await tulisAudit({
    userId: user.id,
    aksi: "HAPUS_LAMPIRAN_EVENT",
    entitas: "EventLampiran",
    entitasId: l.id,
    metadata: { eventId: l.eventId, namaAsli: l.namaAsli, checksumSha256: l.checksumSha256 },
    ipAddress: ip,
  });
  return { ok: true as const };
}

/** Siapa boleh mengunduh: yang boleh melihat eventnya (pemilik dan ketua tim pemilik). */
export async function tautanUnduhLampiran(user: SessionUser, lampiranId: string, opts: { unduh: boolean }) {
  const l = await db.eventLampiran.findUnique({ where: { id: lampiranId }, include: { event: true } });
  if (!l || !(await bolehLihatEvent(user, l.event))) throw new HttpError(404, "Lampiran tidak ditemukan.");
  const pratinjau = l.mimeType.startsWith("image/") || l.mimeType === "application/pdf";
  return signedDownloadUrl(l.objectKey, { namaFile: l.namaAsli, contentType: l.mimeType, inline: pratinjau && !opts.unduh });
}
