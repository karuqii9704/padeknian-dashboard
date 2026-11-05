import { z } from "zod";
import { db } from "@/lib/db";
import { hariIni } from "@/lib/clock";
import { persenAtauNull } from "@/lib/progres";
import { uuidSchema } from "@/lib/schemas";
import { HttpError, type SessionUser } from "@/lib/rbac";

export const dashboardQuery = z.object({
  periodeId: uuidSchema.optional(),
  timId: uuidSchema.optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuery>;

/**
 * Cakupan data dashboard menurut peran:
 *  - KETUA_TIM: hanya tim yang dipimpinnya (default semuanya; `timId` harus salah satunya).
 *  - PIMPINAN/ADMIN : semua tim (atau satu tim bila `timId` diberikan).
 * Periode default adalah periode AKTIF.
 */
export async function tentukanCakupan(user: SessionUser, q: DashboardQuery) {
  const periode = q.periodeId
    ? await db.periode.findUnique({ where: { id: q.periodeId } })
    : await db.periode.findFirst({ where: { status: "AKTIF" } });
  if (!periode) return null;

  let timIds: string[];
  if (user.role === "KETUA_TIM") {
    const milik = await db.timKerja.findMany({ where: { ketuaId: user.id }, select: { id: true } });
    const ids = milik.map((t) => t.id);
    if (q.timId && !ids.includes(q.timId)) throw new HttpError(403, "Anda hanya dapat melihat tim yang Anda pimpin.");
    timIds = q.timId ? [q.timId] : ids;
  } else {
    if (q.timId && !(await db.timKerja.findUnique({ where: { id: q.timId }, select: { id: true } }))) {
      throw new HttpError(404, "Tim kerja tidak ditemukan.");
    }
    timIds = q.timId ? [q.timId] : (await db.timKerja.findMany({ select: { id: true } })).map((t) => t.id);
  }

  const anggota = await db.anggotaTim.findMany({
    where: { periodeId: periode.id, timId: { in: timIds } },
    select: { userId: true, timId: true, user: { select: { nama: true, nip: true, isActive: true } }, tim: { select: { nama: true } } },
  });
  const userIds = [...new Set(anggota.map((a) => a.userId))];
  const aktifIds = [...new Set(anggota.filter((a) => a.user.isActive).map((a) => a.userId))];
  return { periode, timIds, userIds, aktifIds, anggota };
}

export type Cakupan = NonNullable<Awaited<ReturnType<typeof tentukanCakupan>>>;

/** Lima KPI kartu ringkasan untuk periode berjalan (FR-37). */
export async function ringkasanKpi(user: SessionUser, q: DashboardQuery, cakupan?: Cakupan | null) {
  const c = cakupan === undefined ? await tentukanCakupan(user, q) : cakupan;
  if (!c) return null;
  const sekarang = hariIni();

  const [alokasi, tim, stat] = await Promise.all([
    db.alokasi.count({ where: { periodeId: c.periode.id, timId: { in: c.timIds }, status: { not: "DIBATALKAN" } } }),
    db.timKerja.findMany({ where: { id: { in: c.timIds } }, select: { id: true, nama: true }, orderBy: { nama: "asc" } }),
    db.$queryRaw<{ total: bigint; hari_ini: bigint; pegawai_hari_ini: bigint; menunggu: bigint; dengan_bukti: bigint }[]>`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE ph."tanggal" = ${sekarang}::date) AS hari_ini,
        COUNT(DISTINCT ph."user_id") FILTER (WHERE ph."tanggal" = ${sekarang}::date) AS pegawai_hari_ini,
        COUNT(*) FILTER (WHERE ph."status_verifikasi" = 'MENUNGGU') AS menunggu,
        -- IN (subquery tak berkorelasi) = hashed SubPlan sekali jalan, bukan EXISTS per baris.
        COUNT(*) FILTER (WHERE ph."id" IN (SELECT b."pekerjaan_harian_id" FROM "BuktiDukung" b)) AS dengan_bukti
      FROM "PekerjaanHarian" ph
      WHERE ph."periode_id" = ${c.periode.id}::uuid AND ph."user_id" = ANY(${c.userIds}::uuid[])`,
  ]);
  const s = stat[0];
  const total = Number(s.total);
  const denganBukti = Number(s.dengan_bukti);

  return {
    periode: { id: c.periode.id, tahun: c.periode.tahun, bulan: c.periode.bulan, status: c.periode.status },
    hariIni: sekarang,
    tim,
    kpi: {
      pegawaiAktif: c.aktifIds.length,
      alokasiPeriodeIni: alokasi,
      entriTerisiHariIni: Number(s.hari_ini),
      pegawaiMengisiHariIni: Number(s.pegawai_hari_ini),
      entriMenungguVerifikasi: Number(s.menunggu),
      persenEntriBerbukti: persenAtauNull(denganBukti, total),
      totalEntri: total,
      entriBerbukti: denganBukti,
    },
  };
}
