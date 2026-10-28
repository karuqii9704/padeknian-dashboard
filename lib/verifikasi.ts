import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { bentukBukti } from "@/lib/bukti-bentuk";
import { bentukEntri, entriInclude } from "@/lib/pekerjaan";
import { cache } from "react";
import { riwayatVerifikasiBanyak } from "@/lib/verifikasi-riwayat";
import type { SessionUser } from "@/lib/rbac";

export const antreanQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Entri anggota tim yang dipimpin ketua ini pada periode keanggotaannya.
 * Entri milik ketua sendiri dikecualikan: tidak ada verifikasi mandiri (pegawai -> ketua tim satu level).
 */
// Di-memo per permintaan: layout (badge) dan halaman verifikasi memakai cakupan yang sama.
const pasanganKetua = cache((ketuaId: string) =>
  db.anggotaTim.findMany({
    where: { tim: { ketuaId }, userId: { not: ketuaId } },
    select: { userId: true, periodeId: true },
  }),
);

async function cakupanKetua(user: SessionUser): Promise<Prisma.PekerjaanHarianWhereInput> {
  const pasangan = await pasanganKetua(user.id);
  if (pasangan.length === 0) return { id: { in: [] } };
  return { OR: pasangan.map((p) => ({ userId: p.userId, periodeId: p.periodeId })) };
}

/** Antrean MENUNGGU, diurutkan dari yang paling lama menunggu (sejak diajukan / diajukan ulang). */
export async function antreanVerifikasi(user: SessionUser, q: z.infer<typeof antreanQuery>) {
  const where: Prisma.PekerjaanHarianWhereInput = {
    AND: [await cakupanKetua(user), { statusVerifikasi: "MENUNGGU" }, { periode: { status: { not: "DIKUNCI" } } }],
  };
  const [rows, total] = await Promise.all([
    db.pekerjaanHarian.findMany({
      where,
      include: { ...entriInclude, bukti: { orderBy: { uploadedAt: "asc" } } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.pekerjaanHarian.count({ where }),
  ]);
  const riwayat = await riwayatVerifikasiBanyak(rows.map((r) => r.id));
  return {
    data: rows.map((r) => ({
      ...bentukEntri(r),
      diajukanSejak: r.updatedAt.toISOString(),
      bukti: r.bukti.map(bentukBukti),
      verifikasi: riwayat.get(r.id) ?? [],
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** Jumlah entri menunggu (untuk badge navigasi). */
export async function jumlahMenunggu(user: SessionUser) {
  return db.pekerjaanHarian.count({
    where: { AND: [await cakupanKetua(user), { statusVerifikasi: "MENUNGGU" }, { periode: { status: { not: "DIKUNCI" } } }] },
  });
}
