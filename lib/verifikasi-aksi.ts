import { z } from "zod";
import type { AksiVerifikasi, Prisma, StatusVerifikasi } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { formatTanggal } from "@/lib/kalender";
import { buatNotifikasi, susunNotifVerifikasi } from "@/lib/notify";
import { recalculateByPenugasan } from "@/lib/progres-alokasi";
import type { SessionUser } from "@/lib/rbac";

export const MIN_CATATAN = 10;
export const AKSI = ["SETUJUI", "MINTA_REVISI", "TOLAK"] as const;

export const verifikasiSchema = z
  .object({
    aksi: z.enum(AKSI, { message: "Aksi verifikasi tidak valid." }),
    catatan: z.string().trim().max(2000, "Catatan maksimal 2000 karakter.").nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.aksi !== "SETUJUI" && (v.catatan?.length ?? 0) < MIN_CATATAN) {
      ctx.addIssue({ code: "custom", path: ["catatan"], message: `Catatan minimal ${MIN_CATATAN} karakter untuk aksi ini.` });
    }
  });

export type InputVerifikasi = z.infer<typeof verifikasiSchema>;

export const STATUS_HASIL: Record<AksiVerifikasi, StatusVerifikasi> = {
  SETUJUI: "DISETUJUI",
  MINTA_REVISI: "MINTA_REVISI",
  TOLAK: "DITOLAK",
};

export type ServiceError = { ok: false; status: 400 | 403 | 404 | 409; pesan: string };
const fail = (status: ServiceError["status"], pesan: string): ServiceError => ({ ok: false, status, pesan });

type Tx = Prisma.TransactionClient;

/**
 * Wewenang & kondisi: hanya ketua dari tim yang memuat pegawai pada periode entri, bukan atas entri sendiri,
 * entri harus MENUNGGU dan periodenya belum dikunci.
 */
export async function periksaWewenang(client: Tx | typeof db, user: SessionUser, entriId: string) {
  const e = await client.pekerjaanHarian.findUnique({ where: { id: entriId }, include: { periode: true } });
  if (!e) return fail(404, "Catatan tidak ditemukan.");
  if (e.userId === user.id) return fail(403, "Anda tidak dapat memverifikasi catatan Anda sendiri.");
  const anggota = await client.anggotaTim.count({ where: { userId: e.userId, periodeId: e.periodeId, tim: { ketuaId: user.id } } });
  if (anggota === 0) return fail(403, "Anda bukan ketua dari tim pegawai ini.");
  if (e.periode.status === "DIKUNCI") return fail(409, "Periode sudah dikunci; catatan tidak dapat diverifikasi.");
  if (e.statusVerifikasi !== "MENUNGGU") return fail(409, "Catatan ini tidak sedang menunggu verifikasi (mungkin sudah diverifikasi).");
  return { ok: true as const, entri: e };
}

/** Terapkan verifikasi di dalam transaksi: tulis riwayat (append-only), ubah status, hitung ulang progres. */
export async function terapkanVerifikasi(tx: Tx, user: SessionUser, entriId: string, input: InputVerifikasi) {
  const w = await periksaWewenang(tx, user, entriId);
  if (!w.ok) return w;

  // Penjaga konkurensi: hanya satu verifikator yang berhasil mengubah MENUNGGU -> hasil.
  const diubah = await tx.pekerjaanHarian.updateMany({
    where: { id: entriId, statusVerifikasi: "MENUNGGU" },
    data: { statusVerifikasi: STATUS_HASIL[input.aksi] },
  });
  if (diubah.count !== 1) return fail(409, "Catatan ini sudah diverifikasi oleh pihak lain.");

  const v = await tx.verifikasi.create({
    data: { pekerjaanHarianId: entriId, verifikatorId: user.id, aksi: input.aksi, catatan: input.catatan || null },
  });
  await recalculateByPenugasan(w.entri.penugasanId, tx);

  // Beri tahu pegawai (in-app) di transaksi yang sama, lengkap dengan catatan verifikator.
  const [ver, alok] = await Promise.all([
    tx.user.findUnique({ where: { id: user.id }, select: { nama: true } }),
    w.entri.penugasanId
      ? tx.penugasanAlokasi.findUnique({ where: { id: w.entri.penugasanId }, select: { alokasi: { select: { judul: true } } } })
      : Promise.resolve(null),
  ]);
  await buatNotifikasi(tx, [
    {
      userId: w.entri.userId,
      ...susunNotifVerifikasi({
        aksi: input.aksi,
        verifikator: ver?.nama ?? "Ketua tim",
        kegiatan: alok?.alokasi.judul ?? w.entri.judulAdHoc ?? "Tugas tambahan",
        tanggal: formatTanggal(w.entri.tanggal),
        catatan: input.catatan,
      }),
    },
  ]);
  return { ok: true as const, verifikasi: v, entri: w.entri };
}

export async function verifikasiEntri(user: SessionUser, entriId: string, input: InputVerifikasi, ip: string | null) {
  const hasil = await db.$transaction((tx) => terapkanVerifikasi(tx, user, entriId, input));
  if (!hasil.ok) return hasil;
  await tulisAudit({
    userId: user.id,
    aksi: `VERIFIKASI_${input.aksi}`,
    entitas: "PekerjaanHarian",
    entitasId: entriId,
    metadata: { verifikasiId: hasil.verifikasi.id, pegawaiId: hasil.entri.userId },
    ipAddress: ip,
  });
  return { ok: true as const, verifikasi: hasil.verifikasi, statusBaru: STATUS_HASIL[input.aksi] };
}
