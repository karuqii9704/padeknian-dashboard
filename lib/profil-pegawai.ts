import { db } from "@/lib/db";
import { hariIni } from "@/lib/clock";
import { SEL, statusSel } from "@/lib/dashboard-analitik";
import { tentukanCakupan } from "@/lib/dashboard";
import { entriPegawai } from "@/lib/dashboard-pegawai";
import { hariKerjaPeriode } from "@/lib/hari-kerja";
import { persenAtauNull } from "@/lib/progres";
import { HttpError, type SessionUser } from "@/lib/rbac";

const JUMLAH_RIWAYAT = 6;

/**
 * Profil satu pegawai untuk Ketua Tim / Pimpinan: identitas, capaian periode terpilih, kalender kepatuhan,
 * progres alokasi, riwayat lintas periode, dan daftar entri.
 * Otorisasi sama dengan dashboard: pegawai harus berada dalam cakupan tim pada periode terpilih.
 * Riwayat lintas periode untuk Ketua Tim hanya memuat periode ketika pegawai menjadi anggota timnya.
 */
export async function profilPegawai(user: SessionUser, userId: string, periodeId?: string) {
  const c = await tentukanCakupan(user, { periodeId });
  if (!c) return null;
  if (!c.userIds.includes(userId)) throw new HttpError(404, "Pegawai tidak ditemukan pada cakupan ini.");
  const sekarang = hariIni();

  const periodeRiwayat = await db.periode.findMany({
    where: {
      OR: [{ tahun: { lt: c.periode.tahun } }, { tahun: c.periode.tahun, bulan: { lte: c.periode.bulan } }],
      anggota: { some: { userId, ...(user.role === "KETUA_TIM" ? { tim: { ketuaId: user.id } } : {}) } },
    },
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
    take: JUMLAH_RIWAYAT,
  });
  const idRiwayat = periodeRiwayat.map((p) => p.id);

  const [pegawai, hk, harian, statRiwayat, penugasan, rincian] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, nama: true, nip: true, jabatan: true, email: true, isActive: true, lastLoginAt: true } }),
    hariKerjaPeriode(c.periode),
    db.$queryRaw<{ tanggal: string; jumlah: bigint; disetujui: bigint; menunggu: bigint; revisi: bigint }[]>`
      SELECT to_char(ph."tanggal", 'YYYY-MM-DD') AS tanggal,
             COUNT(*) AS jumlah,
             COUNT(*) FILTER (WHERE ph."status_verifikasi" = 'DISETUJUI') AS disetujui,
             COUNT(*) FILTER (WHERE ph."status_verifikasi" = 'MENUNGGU') AS menunggu,
             COUNT(*) FILTER (WHERE ph."status_verifikasi" IN ('MINTA_REVISI', 'DITOLAK')) AS revisi
      FROM "PekerjaanHarian" ph
      WHERE ph."periode_id" = ${c.periode.id}::uuid AND ph."user_id" = ${userId}::uuid
      GROUP BY ph."tanggal"`,
    idRiwayat.length === 0
      ? Promise.resolve([])
      : db.$queryRaw<{ periode_id: string; jumlah: bigint; hari_terisi: bigint; disetujui: bigint; menunggu: bigint; revisi: bigint }[]>`
          SELECT ph."periode_id",
                 COUNT(*) AS jumlah,
                 COUNT(DISTINCT ph."tanggal") AS hari_terisi,
                 COUNT(*) FILTER (WHERE ph."status_verifikasi" = 'DISETUJUI') AS disetujui,
                 COUNT(*) FILTER (WHERE ph."status_verifikasi" = 'MENUNGGU') AS menunggu,
                 COUNT(*) FILTER (WHERE ph."status_verifikasi" IN ('MINTA_REVISI', 'DITOLAK')) AS revisi
          FROM "PekerjaanHarian" ph
          WHERE ph."user_id" = ${userId}::uuid AND ph."periode_id" = ANY(${idRiwayat}::uuid[])
          GROUP BY ph."periode_id"`,
    db.penugasanAlokasi.findMany({
      where: { userId, alokasi: { periodeId: c.periode.id, timId: { in: c.timIds }, status: { not: "DIBATALKAN" } } },
      select: {
        id: true,
        targetVolume: true,
        realisasi: true,
        menunggu: true,
        persen: true,
        alokasi: { select: { id: true, judul: true, satuan: true, prioritas: true, tanggalSelesai: true, tim: { select: { nama: true } } } },
      },
      orderBy: { alokasi: { tanggalSelesai: "asc" } },
    }),
    entriPegawai(user, userId, { periodeId: c.periode.id }),
  ]);

  // Kalender: seluruh hari kerja periode; hari mendatang ditandai agar tidak terbaca "kosong".
  const perTanggal = new Map(harian.map((h) => [h.tanggal, h]));
  const kalender = hk.daftar.map((tanggal) => {
    const h = perTanggal.get(tanggal);
    const sel = statusSel(h ? { jumlah: Number(h.jumlah), disetujui: Number(h.disetujui), menunggu: Number(h.menunggu), revisi: Number(h.revisi) } : undefined);
    return { tanggal, sel, jumlah: Number(h?.jumlah ?? 0), mendatang: tanggal > sekarang };
  });
  const berlalu = kalender.filter((k) => !k.mendatang);
  const hariTerisi = berlalu.filter((k) => k.sel !== SEL.KOSONG).length;

  // Hari kerja per periode riwayat (penyebut kepatuhan); periode lampau memakai seluruh hari kerjanya.
  const hkRiwayat = await Promise.all(periodeRiwayat.map((p) => (p.id === c.periode.id ? Promise.resolve(hk) : hariKerjaPeriode(p))));
  const statMap = new Map(statRiwayat.map((s) => [s.periode_id, s]));
  const riwayat = periodeRiwayat
    .map((p, i) => {
      const s = statMap.get(p.id);
      const jumlah = Number(s?.jumlah ?? 0);
      const disetujui = Number(s?.disetujui ?? 0);
      const terisi = Number(s?.hari_terisi ?? 0);
      return {
        periodeId: p.id,
        tahun: p.tahun,
        bulan: p.bulan,
        status: p.status,
        entri: jumlah,
        disetujui,
        menunggu: Number(s?.menunggu ?? 0),
        revisi: Number(s?.revisi ?? 0),
        hariTerisi: terisi,
        hariKerja: hkRiwayat[i].berlalu,
        persenKepatuhan: persenAtauNull(Math.min(terisi, hkRiwayat[i].berlalu), hkRiwayat[i].berlalu),
        persenDisetujui: persenAtauNull(disetujui, jumlah),
      };
    })
    .reverse(); // lama -> baru untuk grafik

  const total = harian.reduce(
    (a, h) => ({ entri: a.entri + Number(h.jumlah), disetujui: a.disetujui + Number(h.disetujui), menunggu: a.menunggu + Number(h.menunggu), revisi: a.revisi + Number(h.revisi) }),
    { entri: 0, disetujui: 0, menunggu: 0, revisi: 0 },
  );

  return {
    pegawai: { ...pegawai, lastLoginAt: pegawai.lastLoginAt?.toISOString() ?? null },
    tim: [...new Set(c.anggota.filter((a) => a.userId === userId).map((a) => a.tim.nama))],
    periode: { id: c.periode.id, tahun: c.periode.tahun, bulan: c.periode.bulan, status: c.periode.status },
    hariIni: sekarang,
    ringkas: {
      ...total,
      hariTerisi,
      hariKerjaBerlalu: berlalu.length,
      hariKerjaPeriode: hk.semua,
      persenKepatuhan: persenAtauNull(hariTerisi, berlalu.length),
      persenDisetujui: persenAtauNull(total.disetujui, total.entri),
    },
    kalender,
    alokasi: penugasan.map((p) => ({
      id: p.id,
      judul: p.alokasi.judul,
      tim: p.alokasi.tim.nama,
      satuan: p.alokasi.satuan,
      prioritas: p.alokasi.prioritas,
      tanggalSelesai: p.alokasi.tanggalSelesai.toISOString().slice(0, 10),
      target: Number(p.targetVolume),
      realisasi: Number(p.realisasi),
      menunggu: Number(p.menunggu),
      persen: Number(p.persen),
    })),
    riwayat,
    entri: rincian?.data ?? [],
  };
}

export type ProfilPegawai = NonNullable<Awaited<ReturnType<typeof profilPegawai>>>;
