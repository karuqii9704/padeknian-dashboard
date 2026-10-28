import { z } from "zod";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { formatTanggal } from "@/lib/kalender";
import { uuidSchema } from "@/lib/schemas";
import { periksaWewenang, terapkanVerifikasi, type ServiceError } from "@/lib/verifikasi-aksi";
import type { SessionUser } from "@/lib/rbac";

export const MAKS_BULK = 100;

export const bulkSchema = z.object({
  ids: z
    .array(uuidSchema)
    .min(1, "Pilih minimal satu catatan.")
    .max(MAKS_BULK, `Maksimal ${MAKS_BULK} catatan per sekali setujui.`)
    .refine((a) => new Set(a).size === a.length, "Ada catatan yang dipilih lebih dari sekali."),
});

export type MasalahBulk = { id: string; status: number; pesan: string };

class BatalBulk extends Error {
  constructor(public masalah: MasalahBulk) {
    super(masalah.pesan);
  }
}

/** Status HTTP paling berat untuk seluruh batch: 404/403 (akses) didahulukan dari 409 (kondisi). */
export function statusBatch(masalah: { status: number }[]) {
  for (const s of [404, 403, 409]) if (masalah.some((m) => m.status === s)) return s;
  return 409;
}

/**
 * Setujui banyak catatan sekaligus (FR-33). Semua-atau-tidak-sama-sekali: bila ada satu catatan yang bukan milik
 * tim, bukan MENUNGGU, atau periodenya dikunci, seluruh batch ditolak dan tidak ada yang berubah.
 */
export async function bulkSetujui(user: SessionUser, ids: string[], ip: string | null) {
  // Pemeriksaan awal (hanya baca) agar semua masalah dilaporkan sekaligus dengan pesan jelas.
  const masalah: MasalahBulk[] = [];
  for (const id of ids) {
    const w = await periksaWewenang(db, user, id);
    if (!w.ok) masalah.push({ id, status: w.status, pesan: w.pesan });
  }
  if (masalah.length) return { ok: false as const, status: statusBatch(masalah), pesan: ringkasMasalah(masalah), masalah };

  try {
    const hasil = await db.$transaction(async (tx) => {
      const out: { id: string; tanggal: string; statusVerifikasi: "DISETUJUI" }[] = [];
      for (const id of ids) {
        const r = await terapkanVerifikasi(tx, user, id, { aksi: "SETUJUI" });
        if (!r.ok) throw new BatalBulk({ id, status: (r as ServiceError).status, pesan: (r as ServiceError).pesan });
        out.push({ id, tanggal: formatTanggal(r.entri.tanggal), statusVerifikasi: "DISETUJUI" });
      }
      return out;
    });
    await tulisAudit({
      userId: user.id,
      aksi: "VERIFIKASI_BULK_SETUJUI",
      entitas: "PekerjaanHarian",
      metadata: { jumlah: ids.length, ids },
      ipAddress: ip,
    });
    return { ok: true as const, jumlah: hasil.length, hasil };
  } catch (e) {
    if (e instanceof BatalBulk) {
      return { ok: false as const, status: e.masalah.status, pesan: ringkasMasalah([e.masalah]), masalah: [e.masalah] };
    }
    throw e;
  }
}

function ringkasMasalah(masalah: MasalahBulk[]) {
  const unik = [...new Set(masalah.map((m) => m.pesan))];
  return `Seluruh pilihan ditolak dan tidak ada yang disetujui (${masalah.length} catatan bermasalah). ${unik.join(" ")}`;
}
