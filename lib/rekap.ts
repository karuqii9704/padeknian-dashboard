import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { kirimJobRekap } from "@/lib/queue";
import { uuidSchema } from "@/lib/schemas";
import { logger } from "@/lib/logger";
import { HttpError, type SessionUser } from "@/lib/rbac";

export type ServiceError = { ok: false; status: 400 | 404 | 409; pesan: string };
const fail = (status: ServiceError["status"], pesan: string): ServiceError => ({ ok: false, status, pesan });

export const generateSchema = z.object({
  periodeId: uuidSchema,
  // Kosong = seluruh pegawai pada periode itu.
  userIds: z.array(uuidSchema).max(500).optional(),
});

/** Antrekan pembuatan rekap per pegawai (asinkron, diproses worker). Setiap generate ulang menambah `versi`. */
export async function mulaiGenerate(
  user: SessionUser,
  input: z.infer<typeof generateSchema>,
  ip: string | null,
  opsi: { final?: boolean } = {},
) {
  const periode = await db.periode.findUnique({ where: { id: input.periodeId } });
  if (!periode) return fail(404, "Periode tidak ditemukan.");

  // Rekap final (dipicu penguncian periode) tidak boleh terhalang generate biasa yang sedang berjalan.
  const aktif = await db.rekapSKP.count({ where: { periodeId: periode.id, status: { in: ["QUEUED", "PROSES"] } } });
  if (aktif > 0 && !opsi.final) return fail(409, "Pembuatan rekap untuk periode ini masih berjalan. Tunggu hingga selesai.");

  const anggota = await db.anggotaTim.findMany({ where: { periodeId: periode.id }, select: { userId: true } });
  const semua = [...new Set(anggota.map((a) => a.userId))];
  const target = input.userIds ? input.userIds.filter((id, i, a) => a.indexOf(id) === i) : semua;
  const tidakTerdaftar = target.filter((id) => !semua.includes(id));
  if (tidakTerdaftar.length) return fail(400, "Ada pegawai yang bukan anggota tim mana pun pada periode ini.");
  if (target.length === 0) return fail(400, "Tidak ada pegawai pada periode ini.");

  // Versi baru per pegawai = versi terakhir + 1 (unik per periode+pegawai+versi).
  const terakhir = await db.rekapSKP.groupBy({ by: ["userId"], where: { periodeId: periode.id, userId: { in: target } }, _max: { versi: true } });
  const versiTerakhir = new Map(terakhir.map((t) => [t.userId, t._max.versi ?? 0]));

  const batchId = randomUUID();
  let dibuat;
  try {
    dibuat = await db.$transaction(
      target.map((userId) =>
        db.rekapSKP.create({
          data: { periodeId: periode.id, userId, batchId, isFinal: !!opsi.final, versi: (versiTerakhir.get(userId) ?? 0) + 1, digeneratOlehId: user.id },
          select: { id: true, userId: true, versi: true, status: true },
        }),
      ),
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail(409, "Permintaan generate bertabrakan dengan permintaan lain. Coba lagi.");
    }
    throw e;
  }

  // Kirim job; bila antrean tidak tersedia, tandai GAGAL agar tidak menggantung sebagai QUEUED.
  const gagal: string[] = [];
  for (const r of dibuat) {
    try {
      await kirimJobRekap(r.id);
    } catch (e) {
      logger.error({ err: e, rekapId: r.id }, "gagal mengantrekan job rekap");
      gagal.push(r.id);
    }
  }
  if (gagal.length) {
    await db.rekapSKP.updateMany({
      where: { id: { in: gagal } },
      data: { status: "GAGAL", errorMessage: "Antrean pekerjaan tidak tersedia. Coba generate ulang.", finishedAt: new Date() },
    });
  }

  await tulisAudit({
    userId: user.id,
    aksi: opsi.final ? "GENERATE_REKAP_FINAL" : "GENERATE_REKAP",
    entitas: "Periode",
    entitasId: periode.id,
    metadata: { jumlahPegawai: dibuat.length, diantrekan: dibuat.length - gagal.length },
    ipAddress: ip,
  });
  return { ok: true as const, jumlah: dibuat.length, rekap: dibuat.map((r) => ({ ...r, status: gagal.includes(r.id) ? ("GAGAL" as const) : r.status })) };
}

/**
 * Daftar rekap terbaru per pegawai pada periode. ADMIN/PIMPINAN melihat semua; KETUA_TIM hanya anggota timnya.
 */
export async function daftarRekap(user: SessionUser, periodeId: string) {
  const periode = await db.periode.findUnique({ where: { id: periodeId } });
  if (!periode) throw new HttpError(404, "Periode tidak ditemukan.");

  const anggota = await db.anggotaTim.findMany({
    where: { periodeId, ...(user.role === "KETUA_TIM" ? { tim: { ketuaId: user.id } } : {}) },
    include: { user: { select: { id: true, nama: true, nip: true } }, tim: { select: { nama: true } } },
  });
  const userIds = [...new Set(anggota.map((a) => a.userId))];

  const rekap = await db.rekapSKP.findMany({
    where: { periodeId, userId: { in: userIds } },
    orderBy: [{ userId: "asc" }, { versi: "desc" }],
    select: { id: true, userId: true, versi: true, status: true, isFinal: true, errorMessage: true, fileXlsxKey: true, filePdfKey: true, createdAt: true, finishedAt: true },
  });
  const terbaru = new Map<string, (typeof rekap)[number]>();
  const jumlahVersi = new Map<string, number>();
  for (const r of rekap) {
    if (!terbaru.has(r.userId)) terbaru.set(r.userId, r);
    jumlahVersi.set(r.userId, (jumlahVersi.get(r.userId) ?? 0) + 1);
  }

  const data = userIds
    .map((id) => {
      const a = anggota.find((x) => x.userId === id)!;
      const r = terbaru.get(id);
      return {
        userId: id,
        nama: a.user.nama,
        nip: a.user.nip,
        tim: anggota.filter((x) => x.userId === id).map((x) => x.tim.nama),
        rekap: r
          ? {
              id: r.id,
              versi: r.versi,
              status: r.status,
              errorMessage: r.errorMessage,
              adaXlsx: !!r.fileXlsxKey,
              adaPdf: !!r.filePdfKey,
              isFinal: r.isFinal,
              dibuatPada: r.createdAt.toISOString(),
              selesaiPada: r.finishedAt?.toISOString() ?? null,
            }
          : null,
        jumlahVersi: jumlahVersi.get(id) ?? 0,
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));

  return {
    periode: { id: periode.id, tahun: periode.tahun, bulan: periode.bulan, status: periode.status },
    sedangBerjalan: data.some((d) => d.rekap && (d.rekap.status === "QUEUED" || d.rekap.status === "PROSES")),
    data,
  };
}

/** Seluruh versi rekap seorang pegawai pada periode (terbaru dulu). Berkas lama tetap tersimpan dan dapat diunduh. */
export async function riwayatVersiRekap(user: SessionUser, periodeId: string, userId: string) {
  const anggota = await db.anggotaTim.count({
    where: { periodeId, userId, ...(user.role === "KETUA_TIM" ? { tim: { ketuaId: user.id } } : {}) },
  });
  if (anggota === 0) throw new HttpError(404, "Pegawai tidak ditemukan pada periode ini.");

  const rows = await db.rekapSKP.findMany({
    where: { periodeId, userId },
    orderBy: { versi: "desc" },
    include: { digeneratOleh: { select: { nama: true } } },
  });
  return {
    data: rows.map((r) => ({
      id: r.id,
      versi: r.versi,
      status: r.status,
      isFinal: r.isFinal,
      errorMessage: r.errorMessage,
      adaXlsx: !!r.fileXlsxKey,
      adaPdf: !!r.filePdfKey,
      digeneratOleh: r.digeneratOleh.nama,
      dibuatPada: r.createdAt.toISOString(),
      selesaiPada: r.finishedAt?.toISOString() ?? null,
    })),
  };
}
