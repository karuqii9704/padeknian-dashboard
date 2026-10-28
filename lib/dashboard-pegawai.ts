import { z } from "zod";
import { db } from "@/lib/db";
import { bentukBukti } from "@/lib/bukti-bentuk";
import { hariKerjaPeriode } from "@/lib/hari-kerja";
import { bentukEntri, entriInclude } from "@/lib/pekerjaan";
import { persenAtauNull } from "@/lib/progres";
import { uuidSchema } from "@/lib/schemas";
import { riwayatVerifikasiBanyak } from "@/lib/verifikasi-riwayat";
import { dashboardQuery, tentukanCakupan, type Cakupan } from "@/lib/dashboard";
import { HttpError, type SessionUser } from "@/lib/rbac";

export const pegawaiQuery = dashboardQuery.extend({ userId: uuidSchema.optional() });
export type PegawaiQuery = z.infer<typeof pegawaiQuery>;

export async function tabelPegawai(user: SessionUser, q: PegawaiQuery, cakupan?: Cakupan | null) {
  const c = cakupan === undefined ? await tentukanCakupan(user, q) : cakupan;
  if (!c) return null;

  let userIds = c.userIds;
  if (q.userId) {
    if (!userIds.includes(q.userId)) throw new HttpError(404, "Pegawai tidak ditemukan pada cakupan ini.");
    userIds = [q.userId];
  }

  const [agregat, volume, terakhir, hk] = await Promise.all([
    db.$queryRaw<{ user_id: string; jumlah: bigint; hari_terisi: bigint; menunggu: bigint }[]>`
      SELECT ph."user_id",
             COUNT(*) AS jumlah,
             COUNT(DISTINCT ph."tanggal") AS hari_terisi,
             COUNT(*) FILTER (WHERE ph."status_verifikasi" = 'MENUNGGU') AS menunggu
      FROM "PekerjaanHarian" ph
      WHERE ph."periode_id" = ${c.periode.id}::uuid AND ph."user_id" = ANY(${userIds}::uuid[])
      GROUP BY ph."user_id"`,
    db.$queryRaw<{ user_id: string; satuan: string; total: string; disetujui: string | null }[]>`
      SELECT ph."user_id", ph."satuan",
             SUM(ph."volume")::text AS total,
             (SUM(ph."volume") FILTER (WHERE ph."status_verifikasi" = 'DISETUJUI'))::text AS disetujui
      FROM "PekerjaanHarian" ph
      WHERE ph."periode_id" = ${c.periode.id}::uuid AND ph."user_id" = ANY(${userIds}::uuid[])
      GROUP BY ph."user_id", ph."satuan"
      ORDER BY ph."satuan"`,
    db.$queryRaw<{ user_id: string; aksi: string; created_at: Date }[]>`
      SELECT DISTINCT ON (ph."user_id") ph."user_id", v."aksi"::text AS aksi, v."created_at"
      FROM "Verifikasi" v JOIN "PekerjaanHarian" ph ON ph."id" = v."pekerjaan_harian_id"
      WHERE ph."periode_id" = ${c.periode.id}::uuid AND ph."user_id" = ANY(${userIds}::uuid[])
      ORDER BY ph."user_id", v."created_at" DESC`,
    hariKerjaPeriode(c.periode),
  ]);

  const agMap = new Map(agregat.map((a) => [a.user_id, a]));
  const terakhirMap = new Map(terakhir.map((t) => [t.user_id, t]));
  const volMap = new Map<string, { satuan: string; total: number; disetujui: number }[]>();
  for (const v of volume) {
    volMap.set(v.user_id, [...(volMap.get(v.user_id) ?? []), { satuan: v.satuan, total: Number(v.total), disetujui: Number(v.disetujui ?? 0) }]);
  }

  const perUser = new Map<string, Cakupan["anggota"]>();
  for (const a of c.anggota) perUser.set(a.userId, [...(perUser.get(a.userId) ?? []), a]);

  const data = userIds
    .map((id) => {
      const rows = perUser.get(id)!;
      const u = rows[0].user;
      const ag = agMap.get(id);
      const t = terakhirMap.get(id);
      const hariTerisi = Number(ag?.hari_terisi ?? 0);
      return {
        userId: id,
        nama: u.nama,
        nip: u.nip,
        isActive: u.isActive,
        tim: rows.map((r) => r.tim.nama),
        jumlahEntri: Number(ag?.jumlah ?? 0),
        volumePerSatuan: volMap.get(id) ?? [],
        hariTerisi,
        persenHariTerisi: persenAtauNull(hariTerisi, hk.berlalu),
        entriMenunggu: Number(ag?.menunggu ?? 0),
        verifikasiTerakhir: t ? { aksi: t.aksi, waktu: t.created_at.toISOString() } : null,
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));

  return {
    periode: { id: c.periode.id, tahun: c.periode.tahun, bulan: c.periode.bulan, status: c.periode.status },
    hariKerja: { periode: hk.semua, berlalu: hk.berlalu },
    data,
  };
}

/** Drill-down: seluruh entri satu pegawai pada periode, lengkap dengan bukti (pratinjau) dan riwayat verifikasi. */
export async function entriPegawai(user: SessionUser, userId: string, q: z.infer<typeof dashboardQuery>) {
  const c = await tentukanCakupan(user, q);
  if (!c) return null;
  if (!c.userIds.includes(userId)) throw new HttpError(404, "Pegawai tidak ditemukan pada cakupan ini.");

  const [pegawai, rows] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, nama: true, nip: true } }),
    db.pekerjaanHarian.findMany({
      where: { periodeId: c.periode.id, userId },
      include: { ...entriInclude, bukti: { orderBy: { uploadedAt: "asc" } } },
      orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  // Satu query untuk riwayat verifikasi seluruh entri (bukan satu query per entri).
  const riwayat = await riwayatVerifikasiBanyak(rows.map((r) => r.id));
  return {
    pegawai,
    periode: { id: c.periode.id, tahun: c.periode.tahun, bulan: c.periode.bulan },
    data: rows.map((r) => ({ ...bentukEntri(r), bukti: r.bukti.map(bentukBukti), verifikasi: riwayat.get(r.id) ?? [] })),
  };
}
