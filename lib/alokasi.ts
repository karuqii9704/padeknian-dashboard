import { z } from "zod";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { formatTanggal } from "@/lib/kalender";
import { bulanSebelumnya, geserTanggal } from "@/lib/salin";
import { persen } from "@/lib/progres";
import { buatNotifikasi } from "@/lib/notify";
import { recalculateProgresAlokasi } from "@/lib/progres-alokasi";
import { PRIORITAS, tanggalSchema, uuidSchema, volumeSchema as volume } from "@/lib/schemas";
import { HttpError, type SessionUser } from "@/lib/rbac";

export type ServiceError = { ok: false; status: 400 | 403 | 404 | 409; pesan: string };
const fail = (status: ServiceError["status"], pesan: string): ServiceError => ({ ok: false, status, pesan });

const penugasanItem = z.object({ userId: uuidSchema, targetVolume: volume.optional() });

const dasar = {
  judul: z.string().trim().min(1, "Judul wajib diisi.").max(200, "Judul maksimal 200 karakter."),
  deskripsi: z.string().trim().min(1, "Deskripsi wajib diisi."),
  tanggalMulai: tanggalSchema,
  tanggalSelesai: tanggalSchema,
  targetVolume: volume,
  satuan: z.string().trim().min(1, "Satuan wajib diisi.").max(30, "Satuan maksimal 30 karakter."),
  prioritas: z.enum(PRIORITAS, { message: "Prioritas tidak valid." }),
  kegiatanId: uuidSchema.nullish(),
};

const urutanTanggal = (v: { tanggalMulai?: string; tanggalSelesai?: string }) =>
  !v.tanggalMulai || !v.tanggalSelesai || v.tanggalMulai <= v.tanggalSelesai;
const pesanUrutan = { message: "Tanggal selesai tidak boleh sebelum tanggal mulai." };
const penugasanList = z.array(penugasanItem).min(1, "Pilih minimal satu penerima.").max(100, "Maksimal 100 penerima.");

export const buatAlokasiSchema = z
  .object({ timId: uuidSchema, periodeId: uuidSchema, ...dasar, penugasan: penugasanList })
  .refine(urutanTanggal, pesanUrutan);

export const ubahAlokasiSchema = z
  .object({
    judul: dasar.judul.optional(),
    deskripsi: dasar.deskripsi.optional(),
    tanggalMulai: dasar.tanggalMulai.optional(),
    tanggalSelesai: dasar.tanggalSelesai.optional(),
    targetVolume: dasar.targetVolume.optional(),
    satuan: dasar.satuan.optional(),
    prioritas: dasar.prioritas.optional(),
    kegiatanId: dasar.kegiatanId,
    penugasan: penugasanList.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan yang dikirim." })
  .refine(urutanTanggal, pesanUrutan);

export const listAlokasiQuery = z.object({
  periodeId: uuidSchema.optional(),
  timId: uuidSchema.optional(),
  penerima: uuidSchema.optional(),
  status: z.enum(["AKTIF", "SELESAI", "DIBATALKAN"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

const tgl = (s: string) => new Date(`${s}T00:00:00Z`);

const alokasiInclude = {
  kegiatan: { select: { id: true, kode: true, uraian: true, isActive: true } },
  tim: { select: { id: true, nama: true } },
  penugasan: { include: { user: { select: { id: true, nama: true, nip: true } } }, orderBy: { user: { nama: "asc" } } },
} satisfies Prisma.AlokasiInclude;

export function bentukAlokasi(a: Prisma.AlokasiGetPayload<{ include: typeof alokasiInclude }>, hanyaUserId?: string) {
  // Realisasi/menunggu/persen dibaca dari agregat tersimpan (diperbarui recalculateProgresAlokasi).
  const tampil = a.penugasan.filter((p) => !hanyaUserId || p.userId === hanyaUserId);
  const target = tampil.reduce((n, p) => n + Number(p.targetVolume), 0);
  const realisasi = tampil.reduce((n, p) => n + Number(p.realisasi), 0);
  const menunggu = tampil.reduce((n, p) => n + Number(p.menunggu), 0);
  return {
    id: a.id,
    periodeId: a.periodeId,
    tim: a.tim,
    kegiatan: a.kegiatan,
    judul: a.judul,
    deskripsi: a.deskripsi,
    tanggalMulai: formatTanggal(a.tanggalMulai),
    tanggalSelesai: formatTanggal(a.tanggalSelesai),
    targetVolume: a.targetVolume.toString(),
    satuan: a.satuan,
    prioritas: a.prioritas,
    status: a.status,
    alasanPembatalan: a.alasanPembatalan,
    // Ringkasan hanya dari porsi yang boleh dilihat peminta (pegawai: porsinya sendiri).
    ringkasan: { target, realisasi, menunggu, persen: persen(realisasi, target) },
    penugasan: tampil.map((p) => ({
      id: p.id,
      userId: p.userId,
      nama: p.user.nama,
      nip: p.user.nip,
      targetVolume: p.targetVolume.toString(),
      realisasi: Number(p.realisasi),
      menunggu: Number(p.menunggu),
      persen: Number(p.persen),
    })),
  };
}

export async function daftarAlokasi(user: SessionUser, q: z.infer<typeof listAlokasiQuery>) {
  const where: Prisma.AlokasiWhereInput = {
    ...(q.periodeId ? { periodeId: q.periodeId } : {}),
    ...(q.timId ? { timId: q.timId } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const and: Prisma.AlokasiWhereInput[] = [];
  const role: Role = user.role;
  let hanyaUserId: string | undefined;
  if (role === "PEGAWAI") {
    hanyaUserId = user.id; // pegawai hanya melihat alokasi dan porsinya sendiri
    and.push({ penugasan: { some: { userId: user.id } } });
  } else if (role === "KETUA_TIM") {
    and.push({ tim: { ketuaId: user.id } });
  }
  if (q.penerima) {
    if (role === "PEGAWAI" && q.penerima !== user.id) {
      throw new HttpError(403, "Anda hanya dapat melihat alokasi milik Anda sendiri.");
    }
    and.push({ penugasan: { some: { userId: q.penerima } } });
  }
  const finalWhere = { ...where, AND: and };
  const [rows, total] = await Promise.all([
    db.alokasi.findMany({
      where: finalWhere,
      include: alokasiInclude,
      orderBy: [{ tanggalSelesai: "asc" }, { createdAt: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.alokasi.count({ where: finalWhere }),
  ]);
  return { data: rows.map((a) => bentukAlokasi(a, hanyaUserId)), total, page: q.page, pageSize: q.pageSize };
}

function cekPeriodeDanTanggal(
  periode: { status: string; tanggalMulai: Date; tanggalSelesai: Date },
  mulai: string,
  selesai: string,
): ServiceError | null {
  if (periode.status === "DIKUNCI") return fail(409, "Periode sudah dikunci; alokasi tidak dapat dibuat atau diubah.");
  const pm = formatTanggal(periode.tanggalMulai);
  const ps = formatTanggal(periode.tanggalSelesai);
  if (mulai < pm || selesai > ps) {
    return fail(400, `Rentang tanggal alokasi harus berada dalam periode (${pm} s/d ${ps}).`);
  }
  return null;
}

async function cekPenerima(timId: string, periodeId: string, items: { userId: string }[]): Promise<ServiceError | null> {
  const ids = items.map((i) => i.userId);
  if (new Set(ids).size !== ids.length) return fail(400, "Penerima yang sama dipilih lebih dari sekali.");
  const anggota = await db.anggotaTim.findMany({
    where: { timId, periodeId, userId: { in: ids } },
    select: { userId: true },
  });
  const ada = new Set(anggota.map((a) => a.userId));
  const bukan = ids.filter((id) => !ada.has(id));
  if (bukan.length) {
    const u = await db.user.findMany({ where: { id: { in: bukan } }, select: { nama: true } });
    const nama = u.map((x) => x.nama).join(", ") || "Penerima";
    return fail(400, `${nama} bukan anggota tim ini pada periode terpilih.`);
  }
  return null;
}

async function cekKegiatan(kegiatanId: string | null | undefined): Promise<ServiceError | null> {
  if (!kegiatanId) return null;
  const k = await db.kegiatan.findUnique({ where: { id: kegiatanId }, select: { isActive: true } });
  if (!k) return fail(400, "Kegiatan tidak ditemukan.");
  if (!k.isActive) return fail(400, "Kegiatan tidak aktif dan tidak dapat dipilih.");
  return null;
}

async function pastikanKetua(user: SessionUser, timId: string) {
  const tim = await db.timKerja.findUnique({ where: { id: timId } });
  if (!tim) throw new HttpError(404, "Tim kerja tidak ditemukan.");
  if (tim.ketuaId !== user.id) throw new HttpError(403, "Anda bukan ketua tim ini.");
  return tim;
}

export async function buatAlokasi(user: SessionUser, input: z.infer<typeof buatAlokasiSchema>, ip: string | null) {
  await pastikanKetua(user, input.timId);
  const periode = await db.periode.findUnique({ where: { id: input.periodeId } });
  if (!periode) return fail(404, "Periode tidak ditemukan.");
  const e1 = cekPeriodeDanTanggal(periode, input.tanggalMulai, input.tanggalSelesai);
  if (e1) return e1;
  const e2 = (await cekPenerima(input.timId, input.periodeId, input.penugasan)) ?? (await cekKegiatan(input.kegiatanId));
  if (e2) return e2;

  const alokasi = await db.alokasi.create({
    data: {
      periodeId: input.periodeId,
      timId: input.timId,
      kegiatanId: input.kegiatanId ?? null,
      judul: input.judul,
      deskripsi: input.deskripsi,
      tanggalMulai: tgl(input.tanggalMulai),
      tanggalSelesai: tgl(input.tanggalSelesai),
      targetVolume: input.targetVolume,
      satuan: input.satuan,
      prioritas: input.prioritas,
      dibuatOlehId: user.id,
      penugasan: {
        create: input.penugasan.map((p) => ({ userId: p.userId, targetVolume: p.targetVolume ?? input.targetVolume })),
      },
    },
    include: alokasiInclude,
  });
  await tulisAudit({
    userId: user.id,
    aksi: "BUAT_ALOKASI",
    entitas: "Alokasi",
    entitasId: alokasi.id,
    metadata: { judul: alokasi.judul, periodeId: alokasi.periodeId, penerima: input.penugasan.map((p) => p.userId) },
    ipAddress: ip,
  });
  // Tiap penerima (selain pembuat) mendapat notifikasi in-app.
  await buatNotifikasi(
    db,
    alokasi.penugasan
      .filter((p) => p.userId !== user.id)
      .map((p) => ({
        userId: p.userId,
        tipe: "ALOKASI_BARU" as const,
        judul: "Alokasi baru",
        isi: `Anda mendapat alokasi "${alokasi.judul}" dengan target ${Number(p.targetVolume)} ${alokasi.satuan}, ${formatTanggal(alokasi.tanggalMulai)} s/d ${formatTanggal(alokasi.tanggalSelesai)}.`,
        link: "/hari-ini",
      })),
  );
  return { ok: true as const, alokasi: bentukAlokasi(alokasi) };
}

export async function ubahAlokasi(user: SessionUser, id: string, input: z.infer<typeof ubahAlokasiSchema>, ip: string | null) {
  const before = await db.alokasi.findUnique({ where: { id }, include: { periode: true, penugasan: true } });
  if (!before) return fail(404, "Alokasi tidak ditemukan.");
  await pastikanKetua(user, before.timId);
  if (before.status === "DIBATALKAN") return fail(409, "Alokasi yang sudah dibatalkan tidak dapat diubah.");

  const mulai = input.tanggalMulai ?? formatTanggal(before.tanggalMulai);
  const selesai = input.tanggalSelesai ?? formatTanggal(before.tanggalSelesai);
  if (mulai > selesai) return fail(400, "Tanggal selesai tidak boleh sebelum tanggal mulai.");
  const e1 = cekPeriodeDanTanggal(before.periode, mulai, selesai);
  if (e1) return e1;
  const e2 =
    (input.penugasan ? await cekPenerima(before.timId, before.periodeId, input.penugasan) : null) ??
    (input.kegiatanId && input.kegiatanId !== before.kegiatanId ? await cekKegiatan(input.kegiatanId) : null);
  if (e2) return e2;

  // Penerima yang sudah punya entri harian tidak boleh dilepas dari alokasi.
  if (input.penugasan) {
    const tetap = new Set(input.penugasan.map((p) => p.userId));
    const dihapus = before.penugasan.filter((p) => !tetap.has(p.userId));
    if (dihapus.length) {
      const adaEntri = await db.pekerjaanHarian.findMany({
        where: { penugasanId: { in: dihapus.map((p) => p.id) } },
        select: { user: { select: { nama: true } } },
        distinct: ["penugasanId"],
      });
      if (adaEntri.length) {
        const nama = [...new Set(adaEntri.map((e) => e.user.nama))].join(", ");
        return fail(409, `${nama} sudah memiliki entri harian pada alokasi ini sehingga tidak dapat dihapus dari penerima.`);
      }
    }
  }

  const targetVolume = input.targetVolume ?? Number(before.targetVolume);
  const alokasi = await db.$transaction(async (tx) => {
    if (input.penugasan) {
      const userIds = input.penugasan.map((p) => p.userId);
      await tx.penugasanAlokasi.deleteMany({ where: { alokasiId: id, userId: { notIn: userIds } } });
      for (const p of input.penugasan) {
        const target = p.targetVolume ?? targetVolume;
        await tx.penugasanAlokasi.upsert({
          where: { alokasiId_userId: { alokasiId: id, userId: p.userId } },
          update: { targetVolume: target },
          create: { alokasiId: id, userId: p.userId, targetVolume: target },
        });
      }
    }
    await tx.alokasi.update({
      where: { id },
      data: {
        ...(input.judul !== undefined ? { judul: input.judul } : {}),
        ...(input.deskripsi !== undefined ? { deskripsi: input.deskripsi } : {}),
        ...(input.tanggalMulai !== undefined ? { tanggalMulai: tgl(input.tanggalMulai) } : {}),
        ...(input.tanggalSelesai !== undefined ? { tanggalSelesai: tgl(input.tanggalSelesai) } : {}),
        ...(input.targetVolume !== undefined ? { targetVolume: input.targetVolume } : {}),
        ...(input.satuan !== undefined ? { satuan: input.satuan } : {}),
        ...(input.prioritas !== undefined ? { prioritas: input.prioritas } : {}),
        ...(input.kegiatanId !== undefined ? { kegiatanId: input.kegiatanId } : {}),
      },
    });
    // Target/penerima bisa berubah -> persentase harus dihitung ulang.
    await recalculateProgresAlokasi(id, tx);
    return tx.alokasi.findUniqueOrThrow({ where: { id }, include: alokasiInclude });
  });
  await tulisAudit({
    userId: user.id,
    aksi: "UBAH_ALOKASI",
    entitas: "Alokasi",
    entitasId: id,
    metadata: {
      sebelum: {
        judul: before.judul,
        tanggalMulai: formatTanggal(before.tanggalMulai),
        tanggalSelesai: formatTanggal(before.tanggalSelesai),
        targetVolume: before.targetVolume.toString(),
        prioritas: before.prioritas,
        penerima: before.penugasan.map((p) => p.userId),
      },
      sesudah: {
        judul: alokasi.judul,
        tanggalMulai: formatTanggal(alokasi.tanggalMulai),
        tanggalSelesai: formatTanggal(alokasi.tanggalSelesai),
        targetVolume: alokasi.targetVolume.toString(),
        prioritas: alokasi.prioritas,
        penerima: alokasi.penugasan.map((p) => p.userId),
      },
    },
    ipAddress: ip,
  });
  return { ok: true as const, alokasi: bentukAlokasi(alokasi) };
}

// --- Salin dari periode sebelumnya (FR-16) ---

export const salinAlokasiSchema = z.object({
  timId: uuidSchema,
  periodeTujuanId: uuidSchema,
  periodeAsalId: uuidSchema.optional(),
});

/**
 * Bangun draft alokasi dari periode sebelumnya. TIDAK menyimpan apa pun:
 * tanpa capaian, tanpa bukti, tanpa status/pembatalan lama. Tanggal digeser ke periode tujuan.
 */
export async function salinDraft(user: SessionUser, input: z.infer<typeof salinAlokasiSchema>) {
  await pastikanKetua(user, input.timId);
  const tujuan = await db.periode.findUnique({ where: { id: input.periodeTujuanId } });
  if (!tujuan) return fail(404, "Periode tujuan tidak ditemukan.");
  if (tujuan.status === "DIKUNCI") return fail(409, "Periode tujuan sudah dikunci; alokasi tidak dapat disalin ke sana.");

  const asal = input.periodeAsalId
    ? await db.periode.findUnique({ where: { id: input.periodeAsalId } })
    : await db.periode.findUnique({ where: { tahun_bulan: bulanSebelumnya(tujuan.tahun, tujuan.bulan) } });
  if (!asal) return fail(404, "Periode sebelumnya tidak ditemukan.");
  if (asal.id === tujuan.id) return fail(400, "Periode asal dan tujuan tidak boleh sama.");

  const sumber = await db.alokasi.findMany({
    where: { periodeId: asal.id, timId: input.timId, status: { not: "DIBATALKAN" } },
    include: alokasiInclude,
    orderBy: [{ tanggalMulai: "asc" }, { createdAt: "asc" }],
  });
  const anggotaTujuan = new Set(
    (await db.anggotaTim.findMany({ where: { timId: input.timId, periodeId: tujuan.id }, select: { userId: true } })).map(
      (a) => a.userId,
    ),
  );

  const draft = sumber.map((a) => ({
    sumberAlokasiId: a.id,
    judul: a.judul,
    deskripsi: a.deskripsi,
    tanggalMulai: geserTanggal(formatTanggal(a.tanggalMulai), tujuan.tahun, tujuan.bulan),
    tanggalSelesai: geserTanggal(formatTanggal(a.tanggalSelesai), tujuan.tahun, tujuan.bulan),
    targetVolume: a.targetVolume.toString(),
    satuan: a.satuan,
    prioritas: a.prioritas,
    kegiatanId: a.kegiatan?.isActive ? a.kegiatan.id : null,
    penugasan: a.penugasan.map((p) => ({
      userId: p.userId,
      nama: p.user.nama,
      targetVolume: p.targetVolume.toString(),
      tersedia: anggotaTujuan.has(p.userId), // false: bukan anggota tim di periode tujuan
    })),
  }));
  return {
    ok: true as const,
    asal: { id: asal.id, tahun: asal.tahun, bulan: asal.bulan },
    tujuan: { id: tujuan.id, tahun: tujuan.tahun, bulan: tujuan.bulan },
    draft,
  };
}

// --- Pembatalan & penghapusan (FR-17) ---

export const batalkanSchema = z.object({
  alasan: z.string().trim().min(1, "Alasan pembatalan wajib diisi.").max(1000, "Alasan maksimal 1000 karakter."),
});

async function muatUntukKetua(user: SessionUser, id: string) {
  const a = await db.alokasi.findUnique({ where: { id }, include: { periode: true, penugasan: { select: { id: true } } } });
  if (!a) throw new HttpError(404, "Alokasi tidak ditemukan.");
  await pastikanKetua(user, a.timId);
  return a;
}

export async function batalkanAlokasi(user: SessionUser, id: string, alasan: string, ip: string | null) {
  const a = await muatUntukKetua(user, id);
  if (a.periode.status === "DIKUNCI") return fail(409, "Periode sudah dikunci; alokasi tidak dapat dibatalkan.");
  if (a.status === "DIBATALKAN") return fail(409, "Alokasi sudah dibatalkan.");
  const updated = await db.alokasi.update({
    where: { id },
    data: { status: "DIBATALKAN", alasanPembatalan: alasan },
    include: alokasiInclude,
  });
  await tulisAudit({
    userId: user.id,
    aksi: "BATALKAN_ALOKASI",
    entitas: "Alokasi",
    entitasId: id,
    metadata: { sebelum: { status: a.status }, sesudah: { status: "DIBATALKAN", alasan } },
    ipAddress: ip,
  });
  return { ok: true as const, alokasi: bentukAlokasi(updated) };
}

/** Hard-delete hanya untuk alokasi tanpa entri harian; selain itu wajib dibatalkan. */
export async function hapusAlokasi(user: SessionUser, id: string, ip: string | null) {
  const a = await muatUntukKetua(user, id);
  if (a.periode.status === "DIKUNCI") return fail(409, "Periode sudah dikunci; alokasi tidak dapat dihapus.");
  const jumlahEntri = await db.pekerjaanHarian.count({ where: { penugasanId: { in: a.penugasan.map((p) => p.id) } } });
  if (jumlahEntri > 0) {
    return fail(409, "Alokasi ini sudah memiliki entri harian sehingga tidak dapat dihapus. Gunakan pembatalan dengan alasan.");
  }
  await db.alokasi.delete({ where: { id } });
  await tulisAudit({
    userId: user.id,
    aksi: "HAPUS_ALOKASI",
    entitas: "Alokasi",
    entitasId: id,
    metadata: { judul: a.judul, periodeId: a.periodeId },
    ipAddress: ip,
  });
  return { ok: true as const };
}
