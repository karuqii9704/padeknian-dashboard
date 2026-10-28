import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { bentukBukti } from "@/lib/bukti-bentuk";
import { MAKS_FILE_PER_ENTRI, buatObjectKey, sanitasiNamaFile, validasiFileBukti } from "@/lib/bukti-file";
import { bolehLihat, muatUntukUbah } from "@/lib/pekerjaan";
import { recalculateByPenugasan } from "@/lib/progres-alokasi";
import { deleteObject, putObject, signedDownloadUrl } from "@/lib/storage";
import { HttpError, type SessionUser } from "@/lib/rbac";

export type ServiceError = { ok: false; status: 400 | 403 | 404 | 409 | 413 | 502; pesan: string };
const fail = (status: ServiceError["status"], pesan: string): ServiceError => ({ ok: false, status, pesan });

/** Entri yang diperbaiki setelah MINTA_REVISI/DITOLAK kembali ke antrean verifikasi. */
async function ajukanUlangBilaPerlu(entriId: string, statusVerifikasi: string, penugasanId: string | null) {
  if (statusVerifikasi === "MINTA_REVISI" || statusVerifikasi === "DITOLAK") {
    await db.pekerjaanHarian.update({ where: { id: entriId }, data: { statusVerifikasi: "MENUNGGU" } });
    await recalculateByPenugasan(penugasanId);
  }
}

export async function unggahBukti(
  user: SessionUser,
  entriId: string,
  file: { nama: string; tipe: string; bytes: Uint8Array },
) {
  // Aturan sama dengan mengubah entri: milik sendiri, periode belum dikunci, belum DISETUJUI.
  const entri = await muatUntukUbah(user, entriId);

  const v = await validasiFileBukti({ bytes: file.bytes, tipeDeklarasi: file.tipe });
  if (!v.ok) return fail(v.status, v.pesan);

  const jumlah = await db.buktiDukung.count({ where: { pekerjaanHarianId: entriId } });
  if (jumlah >= MAKS_FILE_PER_ENTRI) return fail(409, `Maksimal ${MAKS_FILE_PER_ENTRI} file bukti per catatan.`);

  const checksum = createHash("sha256").update(file.bytes).digest("hex");
  const kembar = await db.buktiDukung.findUnique({
    where: { pekerjaanHarianId_checksumSha256: { pekerjaanHarianId: entriId, checksumSha256: checksum } },
  });
  if (kembar) return fail(409, "File yang sama sudah dilampirkan pada catatan ini.");

  const objectKey = buatObjectKey({
    tahun: entri.periode.tahun,
    bulan: entri.periode.bulan,
    userId: user.id,
    uuid: randomUUID(),
    ext: v.ext,
  });
  try {
    await putObject(objectKey, file.bytes, v.mime);
  } catch (e) {
    logger.error({ err: e, entriId }, "gagal menyimpan bukti ke object storage");
    return fail(502, "Penyimpanan bukti sedang bermasalah. Coba lagi beberapa saat.");
  }

  try {
    const bukti = await db.buktiDukung.create({
      data: {
        pekerjaanHarianId: entriId,
        namaAsli: sanitasiNamaFile(file.nama),
        objectKey,
        mimeType: v.mime,
        ukuranBytes: BigInt(file.bytes.byteLength),
        checksumSha256: checksum,
        uploadedById: user.id,
      },
    });
    await ajukanUlangBilaPerlu(entri.id, entri.statusVerifikasi, entri.penugasanId);
    return { ok: true as const, bukti: bentukBukti(bukti) };
  } catch (e) {
    await deleteObject(objectKey).catch(() => undefined); // jangan tinggalkan objek yatim
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail(409, "File yang sama sudah dilampirkan pada catatan ini.");
    }
    throw e;
  }
}

/** Siapa boleh mengunduh: yang boleh melihat entrinya (pemilik, ketua tim, pimpinan, admin). */
export async function tautanUnduh(user: SessionUser, buktiId: string, opts: { unduh: boolean }) {
  const b = await db.buktiDukung.findUnique({ where: { id: buktiId }, include: { pekerjaanHarian: true } });
  if (!b || !(await bolehLihat(user, b.pekerjaanHarian))) throw new HttpError(404, "Bukti tidak ditemukan.");
  const pratinjau = b.mimeType.startsWith("image/") || b.mimeType === "application/pdf";
  const url = await signedDownloadUrl(b.objectKey, {
    namaFile: b.namaAsli,
    contentType: b.mimeType,
    inline: pratinjau && !opts.unduh,
  });
  return url;
}

// --- Hapus & ganti (FR-28) ---

/** Hapus objek dari storage; kegagalan dicatat (tidak menggagalkan permintaan yang DB-nya sudah berubah). */
async function bersihkanObjek(key: string) {
  try {
    await deleteObject(key);
  } catch (e) {
    logger.error({ err: e, key }, "gagal menghapus objek bukti dari storage (yatim)");
  }
}

async function muatBuktiUntukUbah(user: SessionUser, buktiId: string) {
  const b = await db.buktiDukung.findUnique({ where: { id: buktiId } });
  if (!b) throw new HttpError(404, "Bukti tidak ditemukan.");
  // Aturan sama dengan mengubah entri: pemilik, periode belum dikunci, belum DISETUJUI.
  const entri = await muatUntukUbah(user, b.pekerjaanHarianId);
  return { b, entri };
}

export async function hapusBukti(user: SessionUser, buktiId: string, ip: string | null) {
  const { b, entri } = await muatBuktiUntukUbah(user, buktiId);
  await db.buktiDukung.delete({ where: { id: b.id } });
  await bersihkanObjek(b.objectKey);
  await ajukanUlangBilaPerlu(entri.id, entri.statusVerifikasi, entri.penugasanId);
  await tulisAudit({
    userId: user.id,
    aksi: "HAPUS_BUKTI",
    entitas: "BuktiDukung",
    entitasId: b.id,
    metadata: { pekerjaanHarianId: entri.id, namaAsli: b.namaAsli, checksumSha256: b.checksumSha256 },
    ipAddress: ip,
  });
  return { ok: true as const };
}

/** Ganti file: bukti baru dibuat dan yang lama dihapus dalam satu aksi. File baru yang tidak valid tidak mengubah apa pun. */
export async function gantiBukti(
  user: SessionUser,
  buktiId: string,
  file: { nama: string; tipe: string; bytes: Uint8Array },
  ip: string | null,
) {
  const { b: lama, entri } = await muatBuktiUntukUbah(user, buktiId);

  const v = await validasiFileBukti({ bytes: file.bytes, tipeDeklarasi: file.tipe });
  if (!v.ok) return fail(v.status, v.pesan);

  const checksum = createHash("sha256").update(file.bytes).digest("hex");
  const kembar = await db.buktiDukung.findUnique({
    where: { pekerjaanHarianId_checksumSha256: { pekerjaanHarianId: entri.id, checksumSha256: checksum } },
  });
  if (kembar) {
    return fail(409, kembar.id === lama.id ? "File pengganti sama dengan file yang lama." : "File yang sama sudah dilampirkan pada catatan ini.");
  }

  const objectKey = buatObjectKey({
    tahun: entri.periode.tahun,
    bulan: entri.periode.bulan,
    userId: user.id,
    uuid: randomUUID(),
    ext: v.ext,
  });
  try {
    await putObject(objectKey, file.bytes, v.mime);
  } catch (e) {
    logger.error({ err: e, buktiId }, "gagal menyimpan bukti pengganti");
    return fail(502, "Penyimpanan bukti sedang bermasalah. Coba lagi beberapa saat.");
  }

  try {
    const baru = await db.$transaction(async (tx) => {
      await tx.buktiDukung.delete({ where: { id: lama.id } });
      return tx.buktiDukung.create({
        data: {
          pekerjaanHarianId: entri.id,
          namaAsli: sanitasiNamaFile(file.nama),
          objectKey,
          mimeType: v.mime,
          ukuranBytes: BigInt(file.bytes.byteLength),
          checksumSha256: checksum,
          uploadedById: user.id,
        },
      });
    });
    await bersihkanObjek(lama.objectKey);
    await ajukanUlangBilaPerlu(entri.id, entri.statusVerifikasi, entri.penugasanId);
    await tulisAudit({
      userId: user.id,
      aksi: "GANTI_BUKTI",
      entitas: "BuktiDukung",
      entitasId: baru.id,
      metadata: { pekerjaanHarianId: entri.id, menggantikan: lama.id, namaLama: lama.namaAsli, namaBaru: baru.namaAsli },
      ipAddress: ip,
    });
    return { ok: true as const, bukti: bentukBukti(baru) };
  } catch (e) {
    await bersihkanObjek(objectKey); // transaksi gagal: lepas objek baru, yang lama tetap utuh
    throw e;
  }
}
