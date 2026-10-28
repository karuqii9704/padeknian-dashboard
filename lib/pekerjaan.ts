import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { formatTanggal } from "@/lib/kalender";
import { hariIni } from "@/lib/clock";
import { validasiTanggalEntri } from "@/lib/validasi-entri";
import { recalculateByPenugasan } from "@/lib/progres-alokasi";
import { bentukBukti } from "@/lib/bukti-bentuk";
import { riwayatVerifikasi } from "@/lib/verifikasi-riwayat";
import { tanggalSchema, uuidSchema } from "@/lib/schemas";
import { HttpError, type SessionUser } from "@/lib/rbac";

export type ServiceError = { ok: false; status: 400 | 403 | 404 | 409; pesan: string };
const fail = (status: ServiceError["status"], pesan: string): ServiceError => ({ ok: false, status, pesan });

const STATUS_PEKERJAAN = ["BELUM_MULAI", "PROSES", "SELESAI"] as const;
const STATUS_VERIFIKASI = ["MENUNGGU", "DISETUJUI", "MINTA_REVISI", "DITOLAK"] as const;

const volumeEntri = z
  .number({ message: "Volume harus berupa angka." })
  .min(0, "Volume tidak boleh negatif.")
  .max(9_999_999_999.99, "Volume terlalu besar.")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Volume maksimal 2 angka desimal.");

const deskripsi = z.string().trim().min(1, "Deskripsi capaian wajib diisi.");
const satuan = z.string().trim().min(1, "Satuan wajib diisi.").max(30, "Satuan maksimal 30 karakter.");
const kendala = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullish();

export const buatEntriSchema = z
  .object({
    penugasanId: uuidSchema.nullish(),
    isAdHoc: z.boolean().default(false),
    judulAdHoc: z.string().trim().max(200, "Judul tugas tambahan maksimal 200 karakter.").nullish(),
    tanggal: tanggalSchema,
    deskripsiCapaian: deskripsi,
    volume: volumeEntri.default(1),
    satuan: satuan.optional(),
    status: z.enum(STATUS_PEKERJAAN, { message: "Status pekerjaan tidak valid." }).default("PROSES"),
    kendala,
  })
  .superRefine((v, ctx) => {
    if (v.isAdHoc) {
      if (!v.judulAdHoc) ctx.addIssue({ code: "custom", path: ["judulAdHoc"], message: "Judul tugas tambahan wajib diisi." });
      if (v.penugasanId) ctx.addIssue({ code: "custom", path: ["penugasanId"], message: "Tugas tambahan tidak boleh terikat alokasi." });
      if (!v.satuan) ctx.addIssue({ code: "custom", path: ["satuan"], message: "Satuan wajib diisi." });
    } else if (!v.penugasanId) {
      ctx.addIssue({ code: "custom", path: ["penugasanId"], message: "Pilih alokasi pekerjaan." });
    }
  });

export const ubahEntriSchema = z
  .object({
    tanggal: tanggalSchema.optional(),
    deskripsiCapaian: deskripsi.optional(),
    volume: volumeEntri.optional(),
    satuan: satuan.optional(),
    status: z.enum(STATUS_PEKERJAAN, { message: "Status pekerjaan tidak valid." }).optional(),
    kendala,
    judulAdHoc: z.string().trim().min(1, "Judul tugas tambahan wajib diisi.").max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan yang dikirim." });

export const listEntriQuery = z.object({
  periodeId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  tanggalDari: tanggalSchema.optional(),
  tanggalSampai: tanggalSchema.optional(),
  statusVerifikasi: z.enum(STATUS_VERIFIKASI).optional(),
  /** true: hanya entri yang perlu tindakan pegawai (MINTA_REVISI atau DITOLAK). */
  perluTindakan: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const entriInclude = {
  _count: { select: { bukti: true } },
  periode: { select: { status: true } },
  verifikasi: { orderBy: { createdAt: "desc" as const }, take: 1, include: { verifikator: { select: { nama: true } } } },
  user: { select: { id: true, nama: true, nip: true } },
  penugasan: { include: { alokasi: { select: { id: true, judul: true, satuan: true, timId: true, status: true } } } },
} satisfies Prisma.PekerjaanHarianInclude;

type EntriRow = Prisma.PekerjaanHarianGetPayload<{ include: typeof entriInclude }>;

export function bentukEntri(e: EntriRow) {
  return {
    id: e.id,
    periodeId: e.periodeId,
    tanggal: formatTanggal(e.tanggal),
    user: e.user,
    penugasanId: e.penugasanId,
    alokasi: e.penugasan ? { id: e.penugasan.alokasi.id, judul: e.penugasan.alokasi.judul } : null,
    isAdHoc: e.isAdHoc,
    judulAdHoc: e.judulAdHoc,
    deskripsiCapaian: e.deskripsiCapaian,
    volume: e.volume.toString(),
    satuan: e.satuan,
    status: e.status,
    kendala: e.kendala,
    isBackfill: e.isBackfill,
    statusVerifikasi: e.statusVerifikasi,
    jumlahBukti: e._count.bukti,
    periodeDikunci: e.periode.status === "DIKUNCI",
    verifikasiTerakhir: e.verifikasi[0]
      ? { aksi: e.verifikasi[0].aksi, catatan: e.verifikasi[0].catatan, verifikator: e.verifikasi[0].verifikator.nama, createdAt: e.verifikasi[0].createdAt.toISOString() }
      : null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

const tgl = (s: string) => new Date(`${s}T00:00:00Z`);

/** Cari periode: yang diwajibkan (dari alokasi) atau yang memuat tanggal (tugas tambahan). */
async function cariPeriode(tanggal: string, periodeWajibId?: string) {
  const periode = periodeWajibId
    ? await db.periode.findUnique({ where: { id: periodeWajibId } })
    : await db.periode.findFirst({ where: { tanggalMulai: { lte: tgl(tanggal) }, tanggalSelesai: { gte: tgl(tanggal) } } });
  if (!periode) return fail(400, "Tanggal tidak berada dalam periode mana pun.");
  return { ok: true as const, periode };
}

/** Terapkan aturan FR-20 (hari kerja, periode AKTIF, backfill maks 3 hari) terhadap periode yang sudah ditemukan. */
async function validasiTanggal(tanggal: string, periode: { status: "DRAFT" | "AKTIF" | "DIKUNCI"; tanggalMulai: Date; tanggalSelesai: Date }) {
  const libur = await db.hariLibur.findUnique({ where: { tanggal: tgl(tanggal) } });
  const r = validasiTanggalEntri({
    tanggal,
    hariIni: hariIni(),
    periode: { status: periode.status, tanggalMulai: formatTanggal(periode.tanggalMulai), tanggalSelesai: formatTanggal(periode.tanggalSelesai) },
    libur: new Map(libur ? [[tanggal, libur.keterangan]] : []),
  });
  return r.ok ? ({ ok: true as const, isBackfill: r.isBackfill }) : fail(r.status, r.pesan);
}

export async function buatEntri(user: SessionUser, input: z.infer<typeof buatEntriSchema>) {
  let periode: Awaited<ReturnType<typeof db.periode.findUniqueOrThrow>>;
  let penugasanId: string | null = null;
  let satuanEntri = input.satuan;

  if (input.isAdHoc) {
    const p = await cariPeriode(input.tanggal);
    if (!p.ok) return p;
    periode = p.periode;
  } else {
    const penugasan = await db.penugasanAlokasi.findUnique({
      where: { id: input.penugasanId! },
      include: { alokasi: true },
    });
    if (!penugasan) return fail(404, "Alokasi pekerjaan tidak ditemukan.");
    if (penugasan.userId !== user.id) return fail(403, "Alokasi ini bukan milik Anda.");
    if (penugasan.alokasi.status === "DIBATALKAN") return fail(409, "Alokasi ini sudah dibatalkan.");
    const p = await cariPeriode(input.tanggal, penugasan.alokasi.periodeId);
    if (!p.ok) return p;
    periode = p.periode;
    penugasanId = penugasan.id;
    satuanEntri = input.satuan ?? penugasan.alokasi.satuan;
  }

  const v = await validasiTanggal(input.tanggal, periode);
  if (!v.ok) return v;

  const entri = await db.pekerjaanHarian.create({
    data: {
      periodeId: periode.id,
      penugasanId,
      userId: user.id,
      tanggal: tgl(input.tanggal),
      isAdHoc: input.isAdHoc,
      judulAdHoc: input.isAdHoc ? input.judulAdHoc : null,
      deskripsiCapaian: input.deskripsiCapaian,
      volume: input.volume,
      satuan: satuanEntri!,
      status: input.status,
      kendala: input.kendala ?? null,
      isBackfill: v.isBackfill,
    },
    include: entriInclude,
  });
  await recalculateByPenugasan(entri.penugasanId);
  return { ok: true as const, entri: bentukEntri(entri) };
}

/** Siapa boleh melihat entri: pemilik, ketua tim pemilik pada periode itu, PIMPINAN, ADMIN. */
export async function bolehLihat(user: SessionUser, e: { userId: string; periodeId: string }) {
  if (e.userId === user.id) return true;
  if (user.role === "PIMPINAN" || user.role === "ADMIN") return true;
  if (user.role === "KETUA_TIM") {
    const n = await db.anggotaTim.count({
      where: { userId: e.userId, periodeId: e.periodeId, tim: { ketuaId: user.id } },
    });
    return n > 0;
  }
  return false;
}

/** Entri milik satu pengguna pada rentang tanggal (untuk halaman Hari Ini). */
export async function entriMilik(userId: string, dari: string, sampai: string) {
  const rows = await db.pekerjaanHarian.findMany({
    where: { userId, tanggal: { gte: tgl(dari), lte: tgl(sampai) } },
    include: entriInclude,
    orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(bentukEntri);
}

export async function daftarEntri(user: SessionUser, q: z.infer<typeof listEntriQuery>) {
  const and: Prisma.PekerjaanHarianWhereInput[] = [];
  if (user.role === "PEGAWAI") {
    if (q.userId && q.userId !== user.id) throw new HttpError(403, "Anda hanya dapat melihat entri milik Anda sendiri.");
    and.push({ userId: user.id });
  } else if (user.role === "KETUA_TIM") {
    const pasangan = await db.anggotaTim.findMany({
      where: { tim: { ketuaId: user.id } },
      select: { userId: true, periodeId: true },
    });
    and.push({ OR: [{ userId: user.id }, ...pasangan.map((p) => ({ userId: p.userId, periodeId: p.periodeId }))] });
  }
  if (q.userId) and.push({ userId: q.userId });
  if (q.periodeId) and.push({ periodeId: q.periodeId });
  if (q.statusVerifikasi) and.push({ statusVerifikasi: q.statusVerifikasi });
  if (q.perluTindakan === "true") and.push({ statusVerifikasi: { in: ["MINTA_REVISI", "DITOLAK"] } });
  if (q.tanggalDari) and.push({ tanggal: { gte: tgl(q.tanggalDari) } });
  if (q.tanggalSampai) and.push({ tanggal: { lte: tgl(q.tanggalSampai) } });
  const where: Prisma.PekerjaanHarianWhereInput = { AND: and };

  const [rows, total] = await Promise.all([
    db.pekerjaanHarian.findMany({
      where,
      include: entriInclude,
      orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.pekerjaanHarian.count({ where }),
  ]);
  return { data: rows.map(bentukEntri), total, page: q.page, pageSize: q.pageSize };
}

export async function detailEntri(user: SessionUser, id: string) {
  const e = await db.pekerjaanHarian.findUnique({ where: { id }, include: entriInclude });
  if (!e || !(await bolehLihat(user, e))) return fail(404, "Entri tidak ditemukan.");
  const [bukti, verifikasi] = await Promise.all([
    db.buktiDukung.findMany({ where: { pekerjaanHarianId: id }, orderBy: { uploadedAt: "asc" } }),
    riwayatVerifikasi(id),
  ]);
  return { ok: true as const, entri: { ...bentukEntri(e), bukti: bukti.map(bentukBukti), verifikasi } };
}

/** Aturan FR-23: hanya pemilik, periode belum dikunci, dan belum DISETUJUI. */
export async function muatUntukUbah(user: SessionUser, id: string) {
  const e = await db.pekerjaanHarian.findUnique({ where: { id }, include: { ...entriInclude, periode: true } });
  if (!e) throw new HttpError(404, "Entri tidak ditemukan.");
  if (e.userId !== user.id) throw new HttpError(403, "Anda hanya dapat mengubah entri milik Anda sendiri.");
  if (e.periode.status === "DIKUNCI") throw new HttpError(409, "Periode sudah dikunci; entri tidak dapat diubah atau dihapus.");
  if (e.statusVerifikasi === "DISETUJUI") {
    throw new HttpError(409, "Entri yang sudah disetujui tidak dapat diubah atau dihapus.");
  }
  return e;
}

export async function ubahEntri(user: SessionUser, id: string, input: z.infer<typeof ubahEntriSchema>) {
  const e = await muatUntukUbah(user, id);
  if (input.judulAdHoc !== undefined && !e.isAdHoc) {
    return fail(400, "Judul tugas tambahan hanya untuk entri tugas tambahan.");
  }
  // Tanggal hanya divalidasi ulang bila diubah; revisi atas tanggal lama tidak diblokir aturan backfill.
  let tanggalBaru: { periodeId: string; isBackfill: boolean } | null = null;
  if (input.tanggal && input.tanggal !== formatTanggal(e.tanggal)) {
    const p = await cariPeriode(input.tanggal, e.isAdHoc ? undefined : e.periodeId);
    if (!p.ok) return p;
    const v = await validasiTanggal(input.tanggal, p.periode);
    if (!v.ok) return v;
    tanggalBaru = { periodeId: p.periode.id, isBackfill: v.isBackfill };
  }
  const entri = await db.pekerjaanHarian.update({
    where: { id },
    data: {
      ...(tanggalBaru ? { tanggal: tgl(input.tanggal!), periodeId: tanggalBaru.periodeId, isBackfill: tanggalBaru.isBackfill } : {}),
      ...(input.deskripsiCapaian !== undefined ? { deskripsiCapaian: input.deskripsiCapaian } : {}),
      ...(input.volume !== undefined ? { volume: input.volume } : {}),
      ...(input.satuan !== undefined ? { satuan: input.satuan } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.kendala !== undefined ? { kendala: input.kendala } : {}),
      ...(input.judulAdHoc !== undefined ? { judulAdHoc: input.judulAdHoc } : {}),
      // Perbaikan setelah MINTA_REVISI/DITOLAK mengembalikan entri ke antrean verifikasi.
      statusVerifikasi: "MENUNGGU",
    },
    include: entriInclude,
  });
  await recalculateByPenugasan(entri.penugasanId);
  return { ok: true as const, entri: bentukEntri(entri) };
}

export async function hapusEntri(user: SessionUser, id: string, ip: string | null) {
  const e = await muatUntukUbah(user, id);
  if ((await db.verifikasi.count({ where: { pekerjaanHarianId: id } })) > 0) {
    throw new HttpError(409, "Catatan ini sudah pernah diverifikasi sehingga tidak dapat dihapus. Perbaiki isinya dan ajukan ulang.");
  }
  await db.pekerjaanHarian.delete({ where: { id } });
  await recalculateByPenugasan(e.penugasanId);
  await tulisAudit({
    userId: user.id,
    aksi: "HAPUS_ENTRI",
    entitas: "PekerjaanHarian",
    entitasId: id,
    metadata: { tanggal: formatTanggal(e.tanggal), volume: e.volume.toString(), statusVerifikasi: e.statusVerifikasi },
    ipAddress: ip,
  });
  return { ok: true as const };
}
