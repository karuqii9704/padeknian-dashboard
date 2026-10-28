import type { Prisma, PrismaClient } from "@prisma/client";
import { formatTanggal } from "@/lib/kalender";
import { hariKerjaPeriode } from "@/lib/hari-kerja";
import { persenAtauNull } from "@/lib/progres";

type Client = PrismaClient | Prisma.TransactionClient;

export type BarisAlokasi = {
  alokasiId: string;
  judul: string;
  satuan: string;
  prioritas: string;
  statusAlokasi: string;
  target: number;
  realisasi: number; // hanya entri DISETUJUI
  menunggu: number; // dilaporkan terpisah, tidak masuk capaian
  persen: number | null;
  jumlahBukti: number; // berkas bukti pada entri yang dihitung (DISETUJUI)
  tanggalPelaksanaan: string[]; // tanggal entri DISETUJUI (unik, terurut)
};
export type BarisTambahan = { judul: string; satuan: string; realisasi: number; menunggu: number; jumlahBukti: number; tanggalPelaksanaan: string[] };

export type RingkasanRekap = {
  versiSkema: 1;
  dibuatPada: string;
  periode: { id: string; tahun: number; bulan: number; status: string };
  pegawai: { id: string; nama: string; nip: string; jabatan: string | null };
  hariKerja: { periode: number; terisi: number; terisiDisetujui: number; persenTerisi: number | null };
  alokasi: BarisAlokasi[];
  tugasTambahan: BarisTambahan[];
  totalPerSatuan: { satuan: string; disetujui: number; menunggu: number }[];
  entri: { total: number; disetujui: number; menunggu: number; mintaRevisi: number; ditolak: number };
  jumlahBukti: number;
};

const tgl = (d: Date) => formatTanggal(d);
const unikUrut = (xs: string[]) => [...new Set(xs)].sort();

/**
 * Agregasi rekap bulanan satu pegawai dari alokasi, entri harian, status verifikasi, dan bukti dukung.
 * Aturan: hanya entri berstatus DISETUJUI yang masuk capaian; volume MENUNGGU dilaporkan di kolom terpisah;
 * MINTA_REVISI dan DITOLAK tidak dihitung sebagai capaian maupun menunggu.
 */
export async function hitungRingkasanRekap(client: Client, periodeId: string, userId: string): Promise<RingkasanRekap> {
  const periode = await client.periode.findUniqueOrThrow({ where: { id: periodeId } });
  const pegawai = await client.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, nama: true, nip: true, jabatan: true } });

  const [penugasan, entri, hk] = await Promise.all([
    client.penugasanAlokasi.findMany({
      where: { userId, alokasi: { periodeId } },
      include: { alokasi: { select: { id: true, judul: true, satuan: true, prioritas: true, status: true, tanggalMulai: true } } },
    }),
    client.pekerjaanHarian.findMany({
      where: { userId, periodeId },
      select: { id: true, penugasanId: true, tanggal: true, volume: true, satuan: true, statusVerifikasi: true, judulAdHoc: true, _count: { select: { bukti: true } } },
    }),
    hariKerjaPeriode(periode),
  ]);

  const perPenugasan = new Map<string, typeof entri>();
  const tambahan: typeof entri = [];
  for (const e of entri) {
    if (e.penugasanId) perPenugasan.set(e.penugasanId, [...(perPenugasan.get(e.penugasanId) ?? []), e]);
    else tambahan.push(e);
  }

  const jumlah = (xs: typeof entri, status: string) => xs.filter((e) => e.statusVerifikasi === status);
  const sum = (xs: typeof entri) => xs.reduce((n, e) => n + Number(e.volume), 0);
  const bukti = (xs: typeof entri) => xs.reduce((n, e) => n + e._count.bukti, 0);

  const alokasi: BarisAlokasi[] = penugasan
    .map((p) => {
      const rows = perPenugasan.get(p.id) ?? [];
      const ok = jumlah(rows, "DISETUJUI");
      const target = Number(p.targetVolume);
      const realisasi = sum(ok);
      return {
        alokasiId: p.alokasi.id,
        judul: p.alokasi.judul,
        satuan: p.alokasi.satuan,
        prioritas: p.alokasi.prioritas,
        statusAlokasi: p.alokasi.status,
        target,
        realisasi,
        menunggu: sum(jumlah(rows, "MENUNGGU")),
        persen: persenAtauNull(realisasi, target),
        jumlahBukti: bukti(ok),
        tanggalPelaksanaan: unikUrut(ok.map((e) => tgl(e.tanggal))),
        _mulai: tgl(p.alokasi.tanggalMulai),
      };
    })
    // Alokasi yang dibatalkan hanya tampil bila sudah ada capaian yang disetujui.
    .filter((a) => a.statusAlokasi !== "DIBATALKAN" || a.realisasi > 0)
    .sort((a, b) => a._mulai.localeCompare(b._mulai) || a.judul.localeCompare(b.judul))
    .map(({ _mulai, ...rest }) => {
      void _mulai;
      return rest;
    });

  const kelompokTambahan = new Map<string, typeof entri>();
  for (const e of tambahan) {
    const k = `${e.judulAdHoc ?? "Tugas tambahan"}\u0000${e.satuan}`;
    kelompokTambahan.set(k, [...(kelompokTambahan.get(k) ?? []), e]);
  }
  const tugasTambahan: BarisTambahan[] = [...kelompokTambahan.entries()]
    .map(([k, rows]) => {
      const ok = jumlah(rows, "DISETUJUI");
      const [judul, satuan] = k.split("\u0000");
      return { judul, satuan, realisasi: sum(ok), menunggu: sum(jumlah(rows, "MENUNGGU")), jumlahBukti: bukti(ok), tanggalPelaksanaan: unikUrut(ok.map((e) => tgl(e.tanggal))) };
    })
    .sort((a, b) => a.judul.localeCompare(b.judul));

  const perSatuan = new Map<string, { disetujui: number; menunggu: number }>();
  for (const e of entri) {
    const x = perSatuan.get(e.satuan) ?? { disetujui: 0, menunggu: 0 };
    if (e.statusVerifikasi === "DISETUJUI") x.disetujui += Number(e.volume);
    if (e.statusVerifikasi === "MENUNGGU") x.menunggu += Number(e.volume);
    perSatuan.set(e.satuan, x);
  }

  const hariAny = new Set(entri.map((e) => tgl(e.tanggal)));
  const hariOk = new Set(jumlah(entri, "DISETUJUI").map((e) => tgl(e.tanggal)));

  return {
    versiSkema: 1,
    dibuatPada: new Date().toISOString(),
    periode: { id: periode.id, tahun: periode.tahun, bulan: periode.bulan, status: periode.status },
    pegawai,
    hariKerja: { periode: hk.semua, terisi: hariAny.size, terisiDisetujui: hariOk.size, persenTerisi: persenAtauNull(hariAny.size, hk.semua) },
    alokasi,
    tugasTambahan,
    totalPerSatuan: [...perSatuan.entries()].map(([satuan, v]) => ({ satuan, ...v })).sort((a, b) => a.satuan.localeCompare(b.satuan)),
    entri: {
      total: entri.length,
      disetujui: jumlah(entri, "DISETUJUI").length,
      menunggu: jumlah(entri, "MENUNGGU").length,
      mintaRevisi: jumlah(entri, "MINTA_REVISI").length,
      ditolak: jumlah(entri, "DITOLAK").length,
    },
    jumlahBukti: bukti(jumlah(entri, "DISETUJUI")),
  };
}
