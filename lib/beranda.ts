import { db } from "@/lib/db";
import { gabungkanAktivitas, BATAS_AKTIVITAS, type Aktivitas } from "@/lib/beranda-aktivitas";
import { jamJakarta, namaDepan, sapaan } from "@/lib/beranda-sapaan";
import { jumlahPerluRevisi, ringkasanHariIni } from "@/lib/hari-ini";
import { formatTanggal } from "@/lib/kalender";
import { penggunaSesi, type SessionUser } from "@/lib/rbac";
import { jumlahMenunggu } from "@/lib/verifikasi";

/** Lima pekerjaan dan event terakhir milik pengguna, digabung dan diurutkan terbaru dulu. */
export async function aktivitasTerakhir(userId: string): Promise<Aktivitas[]> {
  const [pekerjaan, event] = await Promise.all([
    db.pekerjaanHarian.findMany({
      where: { userId },
      orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
      take: BATAS_AKTIVITAS,
      select: {
        id: true,
        tanggal: true,
        judulAdHoc: true,
        statusVerifikasi: true,
        createdAt: true,
        penugasan: { select: { alokasi: { select: { judul: true } } } },
      },
    }),
    db.event.findMany({
      where: { userId },
      orderBy: [{ tanggalMulai: "desc" }, { createdAt: "desc" }],
      take: BATAS_AKTIVITAS,
      select: { id: true, judul: true, tanggalMulai: true, createdAt: true },
    }),
  ]);

  return gabungkanAktivitas(
    pekerjaan.map((p) => {
      const tanggal = formatTanggal(p.tanggal);
      return {
        tipe: "pekerjaan" as const,
        id: p.id,
        judul: p.penugasan?.alokasi.judul ?? p.judulAdHoc ?? "Pekerjaan",
        tanggal,
        status: p.statusVerifikasi,
        href: `/kalender?tanggal=${tanggal}`,
        dibuat: p.createdAt.toISOString(),
      };
    }),
    event.map((e) => ({
      tipe: "event" as const,
      id: e.id,
      judul: e.judul,
      tanggal: formatTanggal(e.tanggalMulai),
      href: "/event",
      dibuat: e.createdAt.toISOString(),
    })),
  );
}

/** Semua data halaman Beranda dalam satu panggilan paralel (tanpa query baru di luar aktivitas terakhir). */
export async function ringkasanBeranda(user: SessionUser) {
  const [pengguna, hari, revisi, menunggu, aktivitas] = await Promise.all([
    penggunaSesi(),
    ringkasanHariIni(user),
    jumlahPerluRevisi(user.id),
    user.role === "KETUA_TIM" ? jumlahMenunggu(user) : Promise.resolve(null),
    aktivitasTerakhir(user.id),
  ]);
  const nama = pengguna?.nama ?? "";
  return {
    nama,
    salam: `${sapaan(jamJakarta())}, ${namaDepan(nama)}`,
    hariIni: hari.hariIni,
    hariKerja: hari.hariKerja,
    keterangan: hari.keterangan,
    adaPeriode: !!hari.periode,
    bisaCatat: !!hari.periode && hari.tanggalBolehDicatat.length > 0,
    jumlahEntriHariIni: hari.jumlahEntriHariIni,
    jumlahAlokasi: hari.alokasi.length,
    alokasiTeratas: hari.alokasi.slice(0, 3),
    revisi,
    menunggu,
    aktivitas,
  };
}
