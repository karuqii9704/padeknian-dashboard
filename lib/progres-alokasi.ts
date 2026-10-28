import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { persen, susunAgregat, type Agregat } from "@/lib/progres";

type Tx = Prisma.TransactionClient;

/** Hitung langsung dari entri harian (sumber kebenaran). Dipakai recalculate dan untuk uji silang. */
export async function agregatLangsung(client: Tx | PrismaClient, penugasanIds: string[]): Promise<Map<string, Agregat>> {
  if (penugasanIds.length === 0) return new Map();
  const rows = await client.pekerjaanHarian.groupBy({
    by: ["penugasanId", "statusVerifikasi"],
    where: { penugasanId: { in: penugasanIds } },
    _sum: { volume: true },
  });
  return susunAgregat(
    rows.map((r) => ({
      penugasanId: r.penugasanId,
      statusVerifikasi: r.statusVerifikasi,
      volume: Number(r._sum.volume ?? 0),
    })),
  );
}

async function hitungUlang(tx: Tx, alokasiId: string) {
  const pens = await tx.penugasanAlokasi.findMany({ where: { alokasiId }, select: { id: true, targetVolume: true } });
  const ag = await agregatLangsung(tx, pens.map((p) => p.id));

  let totalTarget = 0;
  let totalReal = 0;
  let totalMenunggu = 0;
  for (const p of pens) {
    const a = ag.get(p.id) ?? { realisasi: 0, menunggu: 0 };
    const target = Number(p.targetVolume);
    totalTarget += target;
    totalReal += a.realisasi;
    totalMenunggu += a.menunggu;
    await tx.penugasanAlokasi.update({
      where: { id: p.id },
      data: { realisasi: a.realisasi, menunggu: a.menunggu, persen: persen(a.realisasi, target) },
    });
  }
  await tx.alokasi.update({
    where: { id: alokasiId },
    data: { realisasi: totalReal, menunggu: totalMenunggu, persen: persen(totalReal, totalTarget) },
  });
}

/**
 * Hitung ulang akumulasi volume dan persentase progres satu alokasi (FR-22).
 * Idempoten: hasil hanya bergantung pada isi tabel entri saat ini. Panggil setiap entri dibuat,
 * diubah, dihapus, atau status verifikasinya berubah, serta saat penerima/target alokasi berubah.
 * Bila `client` adalah transaksi yang sedang berjalan, perhitungan ikut di dalamnya.
 */
export async function recalculateProgresAlokasi(alokasiId: string, client?: Tx) {
  if (client) return hitungUlang(client, alokasiId);
  return db.$transaction((tx) => hitungUlang(tx, alokasiId));
}

/** Cari alokasi dari penugasan lalu hitung ulang; aman dipanggil dengan penugasanId null (tugas tambahan). */
export async function recalculateByPenugasan(penugasanId: string | null | undefined, client?: Tx) {
  if (!penugasanId) return;
  const c = client ?? db;
  const p = await c.penugasanAlokasi.findUnique({ where: { id: penugasanId }, select: { alokasiId: true } });
  if (p) await recalculateProgresAlokasi(p.alokasiId, client);
}

/** Hitung ulang semua alokasi (alat pemulihan bila agregat diduga tidak sinkron). */
export async function recalculateSemua() {
  const semua = await db.alokasi.findMany({ select: { id: true } });
  for (const a of semua) await recalculateProgresAlokasi(a.id);
  return semua.length;
}
