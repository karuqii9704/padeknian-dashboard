import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { mulaiGenerate } from "@/lib/rekap";
import type { SessionUser } from "@/lib/rbac";

export type ServiceError = { ok: false; status: 404 | 409; pesan: string };

/**
 * Kunci periode (FR-46): seluruh data periode menjadi read-only (ditegakkan di tiap service/endpoint yang memeriksa
 * status DIKUNCI) dan rekap final otomatis diantrekan ke worker.
 */
export async function kunciPeriode(user: SessionUser, id: string, ip: string | null) {
  const p = await db.periode.findUnique({ where: { id } });
  if (!p) return { ok: false, status: 404, pesan: "Periode tidak ditemukan." } satisfies ServiceError;
  if (p.status === "DIKUNCI") return { ok: false, status: 409, pesan: "Periode sudah dikunci." } satisfies ServiceError;

  // Penjaga konkurensi: hanya satu permintaan yang berhasil mengunci.
  const sekarang = new Date();
  const diubah = await db.periode.updateMany({
    where: { id, status: { not: "DIKUNCI" } },
    data: { status: "DIKUNCI", dikunciOlehId: user.id, dikunciAt: sekarang },
  });
  if (diubah.count !== 1) return { ok: false, status: 409, pesan: "Periode sudah dikunci." } satisfies ServiceError;

  await tulisAudit({
    userId: user.id,
    aksi: "KUNCI_PERIODE",
    entitas: "Periode",
    entitasId: id,
    metadata: { sebelum: { status: p.status }, sesudah: { status: "DIKUNCI" }, tahun: p.tahun, bulan: p.bulan },
    ipAddress: ip,
  });

  // Rekap final: dibuat setelah penguncian sehingga memuat data akhir. Kegagalan memicu tidak membatalkan penguncian.
  const rekap = await mulaiGenerate(user, { periodeId: id }, ip, { final: true });
  const periode = await db.periode.findUniqueOrThrow({ where: { id } });
  return {
    ok: true as const,
    periode: { id: periode.id, tahun: periode.tahun, bulan: periode.bulan, status: periode.status, dikunciAt: periode.dikunciAt?.toISOString() ?? null, dikunciOlehId: periode.dikunciOlehId },
    rekapFinal: rekap.ok ? { dimulai: true as const, jumlah: rekap.jumlah } : { dimulai: false as const, alasan: rekap.pesan },
  };
}
