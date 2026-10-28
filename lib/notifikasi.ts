import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export const listNotifQuery = z.object({
  belumDibaca: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Notifikasi milik sendiri, terbaru dulu; sertakan jumlah belum dibaca (untuk ikon lonceng). */
export async function daftarNotifikasi(userId: string, q: z.infer<typeof listNotifQuery>) {
  const where: Prisma.NotifikasiWhereInput = { userId, ...(q.belumDibaca === "true" ? { isRead: false } : {}) };
  const [rows, total, belumDibaca] = await Promise.all([
    db.notifikasi.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.notifikasi.count({ where }),
    db.notifikasi.count({ where: { userId, isRead: false } }),
  ]);
  return {
    data: rows.map((n) => ({
      id: n.id,
      tipe: n.tipe,
      judul: n.judul,
      isi: n.isi,
      link: n.link,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    })),
    total,
    belumDibaca,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Hanya pemilik yang dapat menandai; mengembalikan false bila notifikasi bukan miliknya / tidak ada. */
export async function tandaiBaca(userId: string, id: string) {
  const r = await db.notifikasi.updateMany({ where: { id, userId }, data: { isRead: true } });
  return r.count === 1;
}

export async function tandaiSemuaBaca(userId: string) {
  const r = await db.notifikasi.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
  return r.count;
}
