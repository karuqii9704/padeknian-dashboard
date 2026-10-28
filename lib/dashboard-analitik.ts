import { db } from "@/lib/db";
import { hariIni } from "@/lib/clock";
import { hariKerjaPeriode } from "@/lib/hari-kerja";
import { persenAtauNull } from "@/lib/progres";
import type { Cakupan } from "@/lib/dashboard";

/** Kode status satu sel heatmap (pegawai × hari kerja). Urutan = tingkat keparahan saat digabung. */
export const SEL = { KOSONG: 0, DISETUJUI: 1, MENUNGGU: 2, REVISI: 3 } as const;
export type KodeSel = (typeof SEL)[keyof typeof SEL];

type BarisHari = { user_id: string; tanggal: string; jumlah: number; disetujui: number; menunggu: number; revisi: number };

/** Status gabungan satu hari: revisi/ditolak > menunggu > disetujui. Murni, mudah diuji. */
export function statusSel(b: Pick<BarisHari, "jumlah" | "disetujui" | "menunggu" | "revisi"> | undefined): KodeSel {
  if (!b || b.jumlah === 0) return SEL.KOSONG;
  if (b.revisi > 0) return SEL.REVISI;
  if (b.menunggu > 0) return SEL.MENUNGGU;
  return SEL.DISETUJUI;
}

/**
 * Susun tren, per-tim, sebaran status dan heatmap dari agregat (pegawai, tanggal). Murni (tanpa DB).
 * `hariKerja` = hari kerja yang ditampilkan (sudah berlalu untuk periode berjalan).
 */
export function susunAnalitik(
  c: Pick<Cakupan, "anggota" | "userIds">,
  tim: { id: string; nama: string }[],
  hariKerja: string[],
  baris: BarisHari[],
) {
  const kunci = (u: string, t: string) => `${u}|${t}`;
  const peta = new Map(baris.map((b) => [kunci(b.user_id, b.tanggal), b]));
  const hkSet = new Set(hariKerja);

  // Tren per hari kerja: jumlah entri per status + pegawai yang mengisi.
  const tren = hariKerja.map((tanggal) => {
    let entri = 0, disetujui = 0, menunggu = 0, revisi = 0, pegawai = 0;
    for (const u of c.userIds) {
      const b = peta.get(kunci(u, tanggal));
      if (!b) continue;
      entri += b.jumlah;
      disetujui += b.disetujui;
      menunggu += b.menunggu;
      revisi += b.revisi;
      pegawai += 1;
    }
    return { tanggal, entri, disetujui, menunggu, revisi, pegawai };
  });

  // Hari terisi per pegawai (hanya hari kerja yang dihitung).
  const hariTerisi = new Map<string, number>();
  for (const b of baris) if (hkSet.has(b.tanggal)) hariTerisi.set(b.user_id, (hariTerisi.get(b.user_id) ?? 0) + 1);

  const status = { disetujui: 0, menunggu: 0, revisi: 0 };
  const perUser = new Map<string, { entri: number; disetujui: number; menunggu: number; revisi: number }>();
  for (const b of baris) {
    status.disetujui += b.disetujui;
    status.menunggu += b.menunggu;
    status.revisi += b.revisi;
    const p = perUser.get(b.user_id) ?? { entri: 0, disetujui: 0, menunggu: 0, revisi: 0 };
    p.entri += b.jumlah;
    p.disetujui += b.disetujui;
    p.menunggu += b.menunggu;
    p.revisi += b.revisi;
    perUser.set(b.user_id, p);
  }

  const perTim = tim.map((t) => {
    const anggota = [...new Set(c.anggota.filter((a) => a.timId === t.id && a.user.isActive).map((a) => a.userId))];
    let entri = 0, disetujui = 0, menunggu = 0, revisi = 0, terisi = 0;
    for (const u of anggota) {
      const p = perUser.get(u);
      if (p) {
        entri += p.entri;
        disetujui += p.disetujui;
        menunggu += p.menunggu;
        revisi += p.revisi;
      }
      terisi += hariTerisi.get(u) ?? 0;
    }
    return {
      id: t.id,
      nama: t.nama,
      anggota: anggota.length,
      entri,
      disetujui,
      menunggu,
      revisi,
      // Kepatuhan: rata-rata hari terisi anggota terhadap hari kerja yang sudah berjalan.
      persenKepatuhan: persenAtauNull(terisi, anggota.length * hariKerja.length),
    };
  });

  // Heatmap: satu baris per pegawai aktif, urut nama; sel berurutan mengikuti `hariKerja`.
  const namaPegawai = new Map<string, { nama: string; aktif: boolean }>();
  for (const a of c.anggota) namaPegawai.set(a.userId, { nama: a.user.nama, aktif: a.user.isActive });
  const heatmap = c.userIds
    .filter((u) => namaPegawai.get(u)?.aktif)
    .map((u) => ({
      userId: u,
      nama: namaPegawai.get(u)!.nama,
      sel: hariKerja.map((t) => statusSel(peta.get(kunci(u, t)))),
      terisi: hariTerisi.get(u) ?? 0,
    }))
    .sort((a, b) => a.terisi - b.terisi || a.nama.localeCompare(b.nama));

  return { hariKerja, tren, perTim, status, heatmap };
}

/** Analitik dashboard untuk cakupan yang sudah ditentukan (satu query agregat + hari kerja). */
export async function analitikDashboard(c: Cakupan, tim: { id: string; nama: string }[]) {
  const [hk, baris] = await Promise.all([
    hariKerjaPeriode(c.periode),
    db.$queryRaw<{ user_id: string; tanggal: string; jumlah: bigint; disetujui: bigint; menunggu: bigint; revisi: bigint }[]>`
      SELECT ph."user_id",
             to_char(ph."tanggal", 'YYYY-MM-DD') AS tanggal,
             COUNT(*) AS jumlah,
             COUNT(*) FILTER (WHERE ph."status_verifikasi" = 'DISETUJUI') AS disetujui,
             COUNT(*) FILTER (WHERE ph."status_verifikasi" = 'MENUNGGU') AS menunggu,
             COUNT(*) FILTER (WHERE ph."status_verifikasi" IN ('MINTA_REVISI', 'DITOLAK')) AS revisi
      FROM "PekerjaanHarian" ph
      WHERE ph."periode_id" = ${c.periode.id}::uuid AND ph."user_id" = ANY(${c.userIds}::uuid[])
      GROUP BY ph."user_id", ph."tanggal"`,
  ]);
  const sekarang = hariIni();
  const berlalu = hk.daftar.filter((t) => t <= sekarang);
  return susunAnalitik(
    c,
    tim,
    berlalu,
    baris.map((b) => ({
      user_id: b.user_id,
      tanggal: b.tanggal,
      jumlah: Number(b.jumlah),
      disetujui: Number(b.disetujui),
      menunggu: Number(b.menunggu),
      revisi: Number(b.revisi),
    })),
  );
}

export type Analitik = Awaited<ReturnType<typeof analitikDashboard>>;
