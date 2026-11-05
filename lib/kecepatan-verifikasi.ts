import { db } from "@/lib/db";
import type { Cakupan } from "@/lib/dashboard";
import { hitungKecepatan } from "@/lib/kecepatan-verifikasi-hitung";

const JAM_MS = 3_600_000;

/**
 * Kecepatan verifikasi pada cakupan dashboard (periode + tim):
 *  - antrean: catatan MENUNGGU, lama menunggu dihitung sejak terakhir diajukan (updatedAt) sampai sekarang;
 *  - selesai: catatan yang sudah pernah diverifikasi, dari dibuat sampai verifikasi PERTAMA.
 */
export async function kecepatanVerifikasi(c: Cakupan, sekarang = Date.now()) {
  const userIds = c.userIds;
  const [tim, menunggu, verifikasi] = await Promise.all([
    db.timKerja.findMany({ where: { id: { in: c.timIds } }, select: { id: true, nama: true, ketua: { select: { nama: true } } } }),
    db.pekerjaanHarian.findMany({
      where: { periodeId: c.periode.id, userId: { in: userIds }, statusVerifikasi: "MENUNGGU" },
      select: { userId: true, updatedAt: true },
    }),
    db.verifikasi.findMany({
      where: { pekerjaanHarian: { periodeId: c.periode.id, userId: { in: userIds } } },
      select: { pekerjaanHarianId: true, createdAt: true, pekerjaanHarian: { select: { userId: true, createdAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const pertama = new Map<string, (typeof verifikasi)[number]>();
  for (const v of verifikasi) if (!pertama.has(v.pekerjaanHarianId)) pertama.set(v.pekerjaanHarianId, v);

  return hitungKecepatan({
    tim: tim.map((t) => ({ id: t.id, nama: t.nama, ketua: t.ketua.nama })),
    anggota: c.anggota.map((a) => ({ timId: a.timId, userId: a.userId })),
    menunggu: menunggu.map((e) => ({ userId: e.userId, jam: Math.max(0, sekarang - e.updatedAt.getTime()) / JAM_MS })),
    selesai: [...pertama.values()].map((v) => ({
      userId: v.pekerjaanHarian.userId,
      jam: Math.max(0, v.createdAt.getTime() - v.pekerjaanHarian.createdAt.getTime()) / JAM_MS,
    })),
  });
}
