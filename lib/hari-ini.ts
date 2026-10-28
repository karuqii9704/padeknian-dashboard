import { db } from "@/lib/db";
import { hariIni } from "@/lib/clock";
import { formatTanggal, hariKerjaEfektif, isAkhirPekan } from "@/lib/kalender";
import { entriMilik } from "@/lib/pekerjaan";
import { susunKalender } from "@/lib/kalender-status";
import { sisaTarget, urutkanAlokasi } from "@/lib/urutan-alokasi";
import { BATAS_BACKFILL_HARI, tambahHari } from "@/lib/validasi-entri";
import type { SessionUser } from "@/lib/rbac";

const tgl = (s: string) => new Date(`${s}T00:00:00Z`);

const infoPeriode = (p: { id: string; tahun: number; bulan: number; status: string; tanggalMulai: Date; tanggalSelesai: Date }) => ({
  id: p.id,
  tahun: p.tahun,
  bulan: p.bulan,
  status: p.status,
  tanggalMulai: formatTanggal(p.tanggalMulai),
  tanggalSelesai: formatTanggal(p.tanggalSelesai),
});

/** Data halaman "Hari Ini": status hari, jumlah catatan hari ini, dan alokasi berjalan milik pengguna. */
export async function ringkasanHariIni(user: SessionUser) {
  const sekarang = hariIni();
  const [periode, libur] = await Promise.all([
    db.periode.findFirst({ where: { status: "AKTIF" } }),
    db.hariLibur.findUnique({ where: { tanggal: tgl(sekarang) } }),
  ]);
  const akhirPekan = isAkhirPekan(tgl(sekarang));

  const batasMundur = tambahHari(sekarang, -BATAS_BACKFILL_HARI);
  const entriHariIni = await entriMilik(user.id, sekarang, sekarang);
  const jumlahEntriHariIni = entriHariIni.length;

  // Tanggal yang boleh dicatat sekarang: hari kerja dalam 3 hari terakhir hingga hari ini, di dalam periode AKTIF.
  const liburRentang = await db.hariLibur.findMany({ where: { tanggal: { gte: tgl(batasMundur), lte: tgl(sekarang) } } });
  const tanggalBolehDicatat = periode
    ? hariKerjaEfektif(tgl(batasMundur), tgl(sekarang), liburRentang.map((l) => formatTanggal(l.tanggal)))
        .filter((t) => t >= formatTanggal(periode.tanggalMulai) && t <= formatTanggal(periode.tanggalSelesai))
        .reverse()
    : [];

  const penugasan = periode
    ? await db.penugasanAlokasi.findMany({
        where: { userId: user.id, alokasi: { periodeId: periode.id, status: "AKTIF" } },
        include: { alokasi: { select: { id: true, judul: true, satuan: true, prioritas: true, tanggalMulai: true, tanggalSelesai: true } } },
      })
    : [];

  const alokasi = urutkanAlokasi(
    penugasan.map((p) => ({
      penugasanId: p.id,
      alokasiId: p.alokasi.id,
      judul: p.alokasi.judul,
      satuan: p.alokasi.satuan,
      prioritas: p.alokasi.prioritas,
      tanggalMulai: formatTanggal(p.alokasi.tanggalMulai),
      tanggalSelesai: formatTanggal(p.alokasi.tanggalSelesai),
      target: Number(p.targetVolume),
      realisasi: Number(p.realisasi),
      menunggu: Number(p.menunggu),
      persen: Number(p.persen),
      sisa: sisaTarget(Number(p.targetVolume), Number(p.realisasi), Number(p.menunggu)),
    })),
  );

  return {
    hariIni: sekarang,
    batasMundur,
    tanggalBolehDicatat,
    entriHariIni,
    hariKerja: !akhirPekan && !libur,
    keterangan: libur ? `Hari libur: ${libur.keterangan}` : akhirPekan ? "Akhir pekan" : null,
    periode: periode ? infoPeriode(periode) : null,
    jumlahEntriHariIni,
    alokasi,
  };
}

/** Kalender bulanan milik pengguna untuk satu periode (default: periode AKTIF). */
export async function kalenderSaya(user: SessionUser, periodeId?: string) {
  const periode = periodeId
    ? await db.periode.findUnique({ where: { id: periodeId } })
    : ((await db.periode.findFirst({ where: { status: "AKTIF" } })) ?? (await db.periode.findFirst({ orderBy: [{ tahun: "desc" }, { bulan: "desc" }] })));
  if (!periode) return null;

  const [liburRows, entri] = await Promise.all([
    db.hariLibur.findMany({ where: { tanggal: { gte: periode.tanggalMulai, lte: periode.tanggalSelesai } } }),
    db.pekerjaanHarian.findMany({
      where: { userId: user.id, periodeId: periode.id },
      select: { tanggal: true, statusVerifikasi: true },
    }),
  ]);
  const hari = susunKalender(
    periode.tanggalMulai,
    periode.tanggalSelesai,
    new Map(liburRows.map((l) => [formatTanggal(l.tanggal), l.keterangan])),
    entri.map((e) => ({ tanggal: formatTanggal(e.tanggal), statusVerifikasi: e.statusVerifikasi })),
  );
  const sekarang = hariIni();
  const hariKerjaSampaiSekarang = hari.filter((h) => h.hariKerja && h.tanggal <= sekarang);
  return {
    userId: user.id,
    periode: infoPeriode(periode),
    hariIni: sekarang,
    hari,
    ringkas: {
      hariKerja: hari.filter((h) => h.hariKerja).length,
      terisi: hari.filter((h) => h.hariKerja && h.status && h.status !== "KOSONG").length,
      belumTerisi: hariKerjaSampaiSekarang.filter((h) => h.status === "KOSONG").length,
      revisi: hari.filter((h) => h.status === "REVISI").length,
    },
  };
}

/** Jumlah entri milik pengguna yang perlu perbaikan (untuk badge Revisi). */
export function jumlahPerluRevisi(userId: string) {
  return db.pekerjaanHarian.count({ where: { userId, statusVerifikasi: { in: ["MINTA_REVISI", "DITOLAK"] } } });
}
