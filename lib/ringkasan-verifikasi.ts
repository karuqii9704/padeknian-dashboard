import { z } from "zod";
import { db } from "@/lib/db";
import { uuidSchema } from "@/lib/schemas";

export const ringkasanQuery = z.object({
  periodeId: uuidSchema.optional(),
  timId: uuidSchema.optional(),
});

/**
 * Status verifikasi agregat per pegawai untuk satu periode (default: periode AKTIF). Hanya baca (FR-36):
 * dipakai Pimpinan; tidak ada aksi ubah yang terhubung ke data ini.
 */
export async function ringkasanVerifikasi(q: z.infer<typeof ringkasanQuery>) {
  const periode = q.periodeId
    ? await db.periode.findUnique({ where: { id: q.periodeId } })
    : await db.periode.findFirst({ where: { status: "AKTIF" } });
  if (!periode) return null;

  const anggota = await db.anggotaTim.findMany({
    where: { periodeId: periode.id, ...(q.timId ? { timId: q.timId } : {}) },
    include: { user: { select: { id: true, nama: true, nip: true } }, tim: { select: { id: true, nama: true } } },
  });
  const userIds = [...new Set(anggota.map((a) => a.userId))];

  const [hitung, terakhir] = await Promise.all([
    db.pekerjaanHarian.groupBy({
      by: ["userId", "statusVerifikasi"],
      where: { periodeId: periode.id, userId: { in: userIds } },
      _count: { _all: true },
    }),
    db.$queryRaw<{ user_id: string; terakhir: Date }[]>`
      SELECT ph."user_id", MAX(v."created_at") AS terakhir
      FROM "Verifikasi" v
      JOIN "PekerjaanHarian" ph ON ph."id" = v."pekerjaan_harian_id"
      WHERE ph."periode_id" = ${periode.id}::uuid
      GROUP BY ph."user_id"`,
  ]);

  const perUser = new Map<string, Record<string, number>>();
  for (const h of hitung) perUser.set(h.userId, { ...(perUser.get(h.userId) ?? {}), [h.statusVerifikasi]: h._count._all });
  const waktu = new Map(terakhir.map((t) => [t.user_id, t.terakhir.toISOString()]));

  const data = userIds
    .map((id) => {
      const a = anggota.find((x) => x.userId === id)!;
      const c = perUser.get(id) ?? {};
      const menunggu = c.MENUNGGU ?? 0;
      const disetujui = c.DISETUJUI ?? 0;
      const mintaRevisi = c.MINTA_REVISI ?? 0;
      const ditolak = c.DITOLAK ?? 0;
      return {
        userId: id,
        nama: a.user.nama,
        nip: a.user.nip,
        tim: anggota.filter((x) => x.userId === id).map((x) => x.tim.nama),
        total: menunggu + disetujui + mintaRevisi + ditolak,
        menunggu,
        disetujui,
        mintaRevisi,
        ditolak,
        verifikasiTerakhir: waktu.get(id) ?? null,
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));

  return { periode: { id: periode.id, tahun: periode.tahun, bulan: periode.bulan, status: periode.status }, data };
}
