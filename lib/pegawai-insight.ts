import { db } from "@/lib/db";
import { hariKerjaPeriode } from "@/lib/hari-kerja";
import { persenAtauNull } from "@/lib/progres";

/**
 * Analitik kondisi pegawai saat ini untuk halaman "Informasi Pegawai" (admin).
 *
 * Berbeda dari `dashboard-analitik` yang berorientasi tim/ketua, modul ini menjawab pertanyaan
 * admin: "kondisi pegawai sekarang seperti apa?" — komposisi peran, sebaran status, kelengkapan
 * pengisian per pegawai, serta daftar pegawai yang perlu perhatian.
 *
 * Semua perhitungan murni (tanpa DB) diletakkan di `hitungInsight` agar mudah diuji.
 */

export type RingkasanPegawai = {
  total: number;
  aktif: number;
  nonaktif: number;
  wajibGantiPassword: number;
  belumPernahLogin: number;
  perPeran: { role: string; label: string; jumlah: number; aktif: number }[];
};

export type BarisPegawai = {
  userId: string;
  nama: string;
  nip: string;
  role: string;
  jabatan: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  tim: string[];
  jumlahEntri: number;
  hariKerjaBerlalu: number;
  hariTerisi: number;
  persenHariTerisi: number | null;
  entriMenunggu: number;
  entriDisetujui: number;
  entriRevisi: number;
  totalBukti: number;
  hariTerakhir: string | null;
};

export type InsightPegawai = {
  tingkat: "info" | "peringatan" | "galat";
  judul: string;
  keterangan: string;
  prioritas: number;
};

export type AnalitikPegawai = {
  ringkasan: RingkasanPegawai;
  baris: BarisPegawai[];
  insight: InsightPegawai[];
  sebaranStatus: { status: string; label: string; jumlah: number }[];
  sebaranPeran: { role: string; label: string; jumlah: number }[];
  topAktif: { userId: string; nama: string; nilai: number; satuan: string }[];
  barisHari: { tanggal: string; jumlah: number; pegawai: number }[];
  periode: { id: string; tahun: number; bulan: number; status: string } | null;
  hariKerja: { total: number; berlalu: number };
};

export const LABEL_PERAN: Record<string, string> = {
  PEGAWAI: "Pegawai",
  KETUA_TIM: "Ketua Tim",
  PIMPINAN: "Pimpinan",
  ADMIN: "Admin",
};

export const LABEL_STATUS: Record<string, string> = {
  DISETUJUI: "Disetujui",
  MENUNGGU: "Menunggu verifikasi",
  MINTA_REVISI: "Perlu revisi",
  DITOLAK: "Ditolak",
};

/**
 * Hitung insight otomatis dari data ringkas. Murni — mudah diuji.
 * `baris` = status terverifikasi per pegawai, `ringkasan` = komposisi akun.
 */
export function hitungInsight(
  ringkasan: RingkasanPegawai,
  baris: BarisPegawai[],
  sebaranStatus: { status: string; label: string; jumlah: number }[],
): InsightPegawai[] {
  const hasil: InsightPegawai[] = [];
  const Cari = (s: string) => sebaranStatus.find((x) => x.status === s)?.jumlah ?? 0;

  const menunggu = Cari("MENUNGGU");
  const revisi = Cari("MINTA_REVISI") + Cari("DITOLAK");
  const disetujui = Cari("DISETUJUI");
  const totalEntri = menunggu + revisi + disetujui;

  // 1. Antrean verifikasi menumpuk ->iani perlu ditindaklanjuti.
  if (menunggu > 0) {
    hasil.push({
      tingkat: menunggu >= 20 ? "galat" : "peringatan",
      judul: `${menunggu} catatan menunggu verifikasi`,
      keterangan:
        menunggu >= 20
          ? "Antrean verifikasi menumpuk. Menunda verifikasi membuat KPI pegawai tertahan dan memengaruhi rekap bulanan."
          : "Ada catatan yang belum diverifikasi. Proses segera agar capaian pegawai dapat dihitung tepat waktu.",
      prioritas: 90,
    });
  }

  // 2. Catatan bermasalah (revisi/ditolak) -> perlu bimbingan.
  if (revisi > 0) {
    const porsen = persenAtauNull(revisi, totalEntri) ?? 0;
    hasil.push({
      tingkat: porsen >= 25 ? "galat" : "peringatan",
      judul: `${revisi} catatan perlu revisi atau ditolak`,
      keterangan:
        porsen >= 25
          ? `${porsen}% dari seluruh catatan bermasalah. Indikasi pemahaman yang belum adequate atau kurangnya panduan — perlu pendampingan.`
          : "Sebagian catatan ditolak atau meminta revisi. Pastikan feedback yang diberikan jelas agar tidak terulang.",
      prioritas: 80,
    });
  }

  // 3. Pegawai belum mengisi laporan sama sekali -> risiko rekap kosong.
  const belum = baris.filter((b) => b.jumlahEntri === 0 && b.hariKerjaBerlalu > 0);
  if (belum.length > 0) {
    hasil.push({
      tingkat: belum.length >= 3 ? "galat" : "peringatan",
      judul: `${belum.length} pegawai belum mengisi laporan`,
      keterangan:
        "Pegawai berikut belum mencatat pekerjaan pada periode berjalan: " +
        belum.slice(0, 4).map((b) => b.nama).join(", ") +
        (belum.length > 4 ? `, dan ${belum.length - 4} lainnya.` : ". Hubungi atau ingatkan agar rekap tidak kosong."),
      prioritas: 85,
    });
  }

  // 4. Kelengkapan rendah (< 50% hari kerja terisi).
  const rendah = baris.filter((b) => b.persenHariTerisi !== null && b.persenHariTerisi < 50 && b.jumlahEntri > 0);
  if (rendah.length > 0) {
    hasil.push({
      tingkat: "peringatan",
      judul: `${rendah.length} pegawai mengisi di bawah 50% hari kerja`,
      keterangan:
        "Kelengkapan pengisian yang rendah membuat rekap bulanan kurang representatif. Pertimbangkan penyesuaian alokasi atau pendampingan.",
      prioritas: 60,
    });
  }

  // 5. Akun belum pernah login.
  if (ringkasan.belumPernahLogin > 0) {
    hasil.push({
      tingkat: "info",
      judul: `${ringkasan.belumPernahLogin} akun belum pernah login`,
      keterangan:
        "Pastikan akun sudah diterima dan kredensial sementara telah disampaikan lewat kanal aman.",
      prioritas: 40,
    });
  }

  // 6. Password sementara belum diganti -> risiko keamanan.
  if (ringkasan.wajibGantiPassword > 0) {
    hasil.push({
      tingkat: "peringatan",
      judul: `${ringkasan.wajibGantiPassword} akun masih memakai password sementara`,
      keterangan:
        "Akun dengan password sementara belum wajib menggantinya. Minta pengguna mengganti password pada login berikutnya.",
      prioritas: 70,
    });
  }

  // 7. Akun nonaktif masih punya jejak aktivitas.
  const nonaktifAktif = baris.filter((b) => !b.isActive && b.jumlahEntri > 0);
  if (nonaktifAktif.length > 0) {
    hasil.push({
      tingkat: "info",
      judul: `${nonaktifAktif.length} akun nonaktif masih memiliki catatan`,
      keterangan:
        "Data historis akun nonaktif tetap tersimpan dan masuk rekap periode berjalan bila ada. Tinjau bila ini tidak diinginkan.",
      prioritas: 30,
    });
  }

  // 8. Tidak ada activity sama sekali -> kondisi sistem kosong.
  if (totalEntri === 0) {
    hasil.push({
      tingkat: "info",
      judul: "Belum ada aktivitas pencatatan pekerjaan",
      keterangan:
        "Belum ada catatan pekerjaan pada periode berjalan, sehingga insight hanya memuat kondisi akun. Grafik akan terisi setelah pegawai mulai mencatat.",
      prioritas: 50,
    });
  } else {
    // 9. Ringkasan kondisi baik.
    const porsen = persenAtauNull(disetujui, totalEntri) ?? 0;
    hasil.push({
      tingkat: "info",
      judul: `${porsen}% catatan sudah disetujui`,
      keterangan:
        porsen >= 80
          ? "Kondisi pencatatan sedang baik. Sebagian besar catatan terverifikasi tepat waktu."
          : "Sebagian besar catatan belum terverifikasi. Pastikan alokasi waktu verifikasi cukup untuk tim.",
      prioritas: 20,
    });
  }

  return hasil.sort((a, b) => b.prioritas - a.prioritas);
}

/**
 * Ambil data nyata untuk halaman "Informasi Pegawai".
 * Satu periode (AKTIF, atau terbaru bila tidak ada) + seluruh pegawai.
 */
export async function ambilAnalitikPegawai(): Promise<AnalitikPegawai> {
  const periode = await db.periode.findFirst({
    where: { status: "AKTIF" },
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
  });

  const [users, timAnggota] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        nip: true,
        nama: true,
        email: true,
        role: true,
        jabatan: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
      },
      orderBy: [{ nama: "asc" }],
    }),
    db.anggotaTim.findMany({
      select: { userId: true, tim: { select: { nama: true, isActive: true } } },
    }),
  ]);

  // Peta user -> nama tim (hanya tim aktif agar tidak mengotori data lama).
  const timPerUser = new Map<string, string[]>();
  for (const a of timAnggota) {
    if (!a.tim.isActive) continue;
    timPerUser.set(a.userId, [...(timPerUser.get(a.userId) ?? []), a.tim.nama]);
  }

  // Ringkasan akun.
  const perPeranMap = new Map<string, { role: string; label: string; jumlah: number; aktif: number }>();
  for (const u of users) {
    const entry = perPeranMap.get(u.role) ?? {
      role: u.role,
      label: LABEL_PERAN[u.role] ?? u.role,
      jumlah: 0,
      aktif: 0,
    };
    entry.jumlah += 1;
    if (u.isActive) entry.aktif += 1;
    perPeranMap.set(u.role, entry);
  }
  const ringkasan: RingkasanPegawai = {
    total: users.length,
    aktif: users.filter((u) => u.isActive).length,
    nonaktif: users.filter((u) => !u.isActive).length,
    wajibGantiPassword: users.filter((u) => u.mustChangePassword).length,
    belumPernahLogin: users.filter((u) => u.lastLoginAt === null).length,
    perPeran: [...perPeranMap.values()].sort((a, b) => b.jumlah - a.jumlah),
  };

  // Data periode: entri per pegawai per hari + status + bukti.
  let hariKerja = { total: 0, berlalu: 0 };
  const baris: BarisPegawai[] = users.map((u) => ({
    userId: u.id,
    nama: u.nama,
    nip: u.nip,
    role: u.role,
    jabatan: u.jabatan,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    tim: timPerUser.get(u.id) ?? [],
    jumlahEntri: 0,
    hariKerjaBerlalu: 0,
    hariTerisi: 0,
    persenHariTerisi: null,
    entriMenunggu: 0,
    entriDisetujui: 0,
    entriRevisi: 0,
    totalBukti: 0,
    hariTerakhir: null,
  }));
  let sebaranStatus: { status: string; label: string; jumlah: number }[] = [];
  let barisHari: { tanggal: string; jumlah: number; pegawai: number }[] = [];

  if (periode) {
    const [hk, statusAgg, buktiAgg, hariAgg] = await Promise.all([
      hariKerjaPeriode(periode),
      db.pekerjaanHarian.groupBy({
        by: ["statusVerifikasi"],
        where: { periodeId: periode.id },
        _count: { _all: true },
      }),
      db.buktiDukung.groupBy({
        by: ["pekerjaanHarianId"],
        where: { pekerjaanHarian: { periodeId: periode.id } },
        _count: { _all: true },
      }),
      db.pekerjaanHarian.findMany({
        where: { periodeId: periode.id },
        select: { userId: true, tanggal: true, statusVerifikasi: true },
      }),
    ]);

    hariKerja = { total: hk.semua, berlalu: hk.berlalu };
    const hariKerjaSet = new Set(hk.daftar);

    // Jumlah entri per pegawai.
    const jumlahEntri = new Map<string, number>();
    const menunggu = new Map<string, number>();
    const disetujui = new Map<string, number>();
    const revisi = new Map<string, number>();
    const hariTerisi = new Map<string, Set<string>>();
    const hariTerakhir = new Map<string, string>();
    const perHari = new Map<string, { jumlah: number; pegawai: Set<string> }>();

    for (const e of hariAgg) {
      jumlahEntri.set(e.userId, (jumlahEntri.get(e.userId) ?? 0) + 1);
      const tgl = e.tanggal.toISOString().slice(0, 10);
      if (e.statusVerifikasi === "MENUNGGU") menunggu.set(e.userId, (menunggu.get(e.userId) ?? 0) + 1);
      else if (e.statusVerifikasi === "DISETUJUI") disetujui.set(e.userId, (disetujui.get(e.userId) ?? 0) + 1);
      else revisi.set(e.userId, (revisi.get(e.userId) ?? 0) + 1);

      if (hariKerjaSet.has(tgl)) {
        hariTerisi.set(e.userId, (hariTerisi.get(e.userId) ?? new Set()).add(tgl));
        const prev = hariTerakhir.get(e.userId);
        if (!prev || tgl > prev) hariTerakhir.set(e.userId, tgl);
      }
      const hari = perHari.get(tgl) ?? { jumlah: 0, pegawai: new Set<string>() };
      hari.jumlah += 1;
      hari.pegawai.add(e.userId);
      perHari.set(tgl, hari);
    }

    // Jumlah bukti per pegawai (butuh join ke pekerjaan).
    const buktiPerEntri = new Map(buktiAgg.map((b) => [b.pekerjaanHarianId, b._count._all]));
    const entriBukti = await db.pekerjaanHarian.findMany({
      where: { periodeId: periode.id },
      select: { id: true, userId: true },
    });
    const buktiPerUser = new Map<string, number>();
    for (const e of entriBukti) {
      const n = buktiPerEntri.get(e.id) ?? 0;
      if (n > 0) buktiPerUser.set(e.userId, (buktiPerUser.get(e.userId) ?? 0) + n);
    }

    for (const b of baris) {
      b.jumlahEntri = jumlahEntri.get(b.userId) ?? 0;
      b.hariKerjaBerlalu = hk.berlalu;
      b.hariTerisi = hariTerisi.get(b.userId)?.size ?? 0;
      b.persenHariTerisi = persenAtauNull(b.hariTerisi, hk.berlalu);
      b.entriMenunggu = menunggu.get(b.userId) ?? 0;
      b.entriDisetujui = disetujui.get(b.userId) ?? 0;
      b.entriRevisi = revisi.get(b.userId) ?? 0;
      b.totalBukti = buktiPerUser.get(b.userId) ?? 0;
      b.hariTerakhir = hariTerakhir.get(b.userId) ?? null;
    }

    sebaranStatus = statusAgg
      .map((s) => ({ status: s.statusVerifikasi, label: LABEL_STATUS[s.statusVerifikasi] ?? s.statusVerifikasi, jumlah: s._count._all }))
      .sort((a, b) => b.jumlah - a.jumlah);

    barisHari = [...perHari.entries()]
      .map(([tanggal, v]) => ({ tanggal, jumlah: v.jumlah, pegawai: v.pegawai.size }))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }

  // Pegawai paling aktif (entri + bukti) untuk grafik pegawai paling aktif.
  const topAktif = [...baris]
    .filter((b) => b.jumlahEntri > 0)
    .sort((a, b) => b.jumlahEntri - a.jumlahEntri || b.totalBukti - a.totalBukti)
    .slice(0, 8)
    .map((b) => ({ userId: b.userId, nama: b.nama, nilai: b.jumlahEntri, satuan: "entri" }));

  const sebaranPeran = ringkasan.perPeran.map((p) => ({ role: p.role, label: p.label, jumlah: p.jumlah }));

  return {
    ringkasan,
    baris,
    insight: hitungInsight(ringkasan, baris, sebaranStatus),
    sebaranStatus,
    sebaranPeran,
    topAktif,
    barisHari,
    periode: periode
      ? { id: periode.id, tahun: periode.tahun, bulan: periode.bulan, status: periode.status }
      : null,
    hariKerja,
  };
}