import { db } from "@/lib/db";
import type { RingkasanRekap } from "@/lib/rekap-hitung";

/**
 * Rekap SKP milik pengguna sendiri: versi SELESAI terbaru per periode (terbaru dulu), beserta
 * ringkasan angka dari `ringkasanJson`. Hanya data milik `userId`; tidak ada data pegawai lain.
 */
export async function rekapSaya(userId: string) {
  const rows = await db.rekapSKP.findMany({
    where: { userId, status: "SELESAI" },
    orderBy: [{ periode: { tahun: "desc" } }, { periode: { bulan: "desc" } }, { versi: "desc" }],
    select: {
      id: true,
      versi: true,
      isFinal: true,
      finishedAt: true,
      filePdfKey: true,
      ringkasanJson: true,
      periode: { select: { id: true, tahun: true, bulan: true, status: true } },
    },
  });

  const terbaru = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!terbaru.has(r.periode.id)) terbaru.set(r.periode.id, r);

  return [...terbaru.values()].map((r) => {
    const j = r.ringkasanJson as RingkasanRekap | null;
    const valid = j && j.versiSkema === 1;
    return {
      id: r.id,
      versi: r.versi,
      isFinal: r.isFinal,
      selesaiPada: r.finishedAt?.toISOString() ?? null,
      adaPdf: !!r.filePdfKey,
      periode: r.periode,
      ringkasan: valid
        ? {
            hariKerja: j.hariKerja,
            entri: j.entri,
            jumlahBukti: j.jumlahBukti,
            totalPerSatuan: j.totalPerSatuan,
            alokasi: j.alokasi.map((a) => ({ judul: a.judul, satuan: a.satuan, target: a.target, realisasi: a.realisasi, menunggu: a.menunggu, persen: a.persen })),
            jumlahTugasTambahan: j.tugasTambahan.length,
          }
        : null,
    };
  });
}

export type RekapSayaItem = Awaited<ReturnType<typeof rekapSaya>>[number];
