import { db } from "@/lib/db";

/** Riwayat verifikasi satu entri (urut lama -> baru). Dipisah agar tidak membuat impor melingkar. */
export async function riwayatVerifikasi(pekerjaanHarianId: string) {
  const rows = await db.verifikasi.findMany({
    where: { pekerjaanHarianId },
    include: { verifikator: { select: { id: true, nama: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((v) => ({
    id: v.id,
    aksi: v.aksi,
    catatan: v.catatan,
    verifikator: v.verifikator,
    createdAt: v.createdAt.toISOString(),
  }));
}

type Riwayat = Awaited<ReturnType<typeof riwayatVerifikasi>>;

/** Riwayat verifikasi banyak entri sekaligus (satu query), dipetakan per id entri. */
export async function riwayatVerifikasiBanyak(pekerjaanHarianIds: string[]) {
  const peta = new Map<string, Riwayat>();
  if (pekerjaanHarianIds.length === 0) return peta;
  const rows = await db.verifikasi.findMany({
    where: { pekerjaanHarianId: { in: pekerjaanHarianIds } },
    include: { verifikator: { select: { id: true, nama: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const v of rows) {
    const daftar = peta.get(v.pekerjaanHarianId) ?? [];
    daftar.push({ id: v.id, aksi: v.aksi, catatan: v.catatan, verifikator: v.verifikator, createdAt: v.createdAt.toISOString() });
    peta.set(v.pekerjaanHarianId, daftar);
  }
  return peta;
}
