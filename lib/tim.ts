import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { HttpError, type SessionUser } from "@/lib/rbac";

export type ServiceError = { ok: false; status: 400 | 403 | 404 | 409; pesan: string };
const fail = (status: ServiceError["status"], pesan: string): ServiceError => ({ ok: false, status, pesan });

export { uuidSchema } from "@/lib/schemas";
import { uuidSchema } from "@/lib/schemas";

const tahun = z.number().int("Tahun harus bilangan bulat.").min(2000, "Tahun tidak valid.").max(2100, "Tahun tidak valid.");

export const buatTimSchema = z.object({
  nama: z.string().trim().min(1, "Nama tim wajib diisi.").max(120, "Nama tim maksimal 120 karakter."),
  tahun,
  ketuaId: uuidSchema,
});

export const ubahTimSchema = z
  .object({
    nama: z.string().trim().min(1, "Nama tim wajib diisi.").max(120).optional(),
    tahun: tahun.optional(),
    ketuaId: uuidSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan yang dikirim." });

export const ubahAnggotaSchema = z
  .object({
    periodeId: uuidSchema,
    tambah: z.array(uuidSchema).max(200).default([]),
    hapus: z.array(uuidSchema).max(200).default([]),
  })
  .refine((v) => v.tambah.length + v.hapus.length > 0, { message: "Pilih anggota yang ditambah atau dihapus." })
  .refine((v) => !v.tambah.some((id) => v.hapus.includes(id)), {
    message: "Anggota yang sama tidak boleh ditambah dan dihapus sekaligus.",
  });

const timInclude = { ketua: { select: { id: true, nama: true, nip: true } } } satisfies Prisma.TimKerjaInclude;

export function daftarTim(opts: { isActive?: boolean } = {}) {
  return db.timKerja.findMany({
    where: opts.isActive === undefined ? {} : { isActive: opts.isActive },
    include: timInclude,
    orderBy: [{ tahun: "desc" }, { nama: "asc" }],
  });
}

async function cekKetua(ketuaId: string): Promise<ServiceError | null> {
  const k = await db.user.findUnique({ where: { id: ketuaId }, select: { role: true, isActive: true } });
  if (!k) return fail(400, "Ketua tim tidak ditemukan.");
  if (k.role !== "KETUA_TIM") return fail(400, "Ketua tim harus pengguna dengan peran Ketua Tim.");
  if (!k.isActive) return fail(400, "Ketua tim tidak aktif.");
  return null;
}

export async function buatTim(actorId: string, input: z.infer<typeof buatTimSchema>, ip: string | null) {
  const err = await cekKetua(input.ketuaId);
  if (err) return err;
  const tim = await db.timKerja.create({ data: input, include: timInclude });
  await tulisAudit({
    userId: actorId,
    aksi: "BUAT_TIM",
    entitas: "TimKerja",
    entitasId: tim.id,
    metadata: { sesudah: { nama: tim.nama, tahun: tim.tahun, ketuaId: tim.ketuaId } },
    ipAddress: ip,
  });
  return { ok: true as const, tim };
}

export async function ubahTim(actorId: string, id: string, input: z.infer<typeof ubahTimSchema>, ip: string | null) {
  const before = await db.timKerja.findUnique({ where: { id } });
  if (!before) return fail(404, "Tim kerja tidak ditemukan.");
  if (input.ketuaId && input.ketuaId !== before.ketuaId) {
    const err = await cekKetua(input.ketuaId);
    if (err) return err;
  }
  const tim = await db.timKerja.update({ where: { id }, data: input, include: timInclude });
  await tulisAudit({
    userId: actorId,
    aksi: "UBAH_TIM",
    entitas: "TimKerja",
    entitasId: id,
    metadata: {
      sebelum: { nama: before.nama, tahun: before.tahun, ketuaId: before.ketuaId, isActive: before.isActive },
      sesudah: { nama: tim.nama, tahun: tim.tahun, ketuaId: tim.ketuaId, isActive: tim.isActive },
    },
    ipAddress: ip,
  });
  return { ok: true as const, tim };
}

/** ADMIN bebas; KETUA_TIM hanya untuk tim yang dipimpinnya; PIMPINAN hanya baca. */
export async function aksesTim(user: SessionUser, timId: string, opts: { tulis: boolean }) {
  const tim = await db.timKerja.findUnique({ where: { id: timId } });
  if (!tim) throw new HttpError(404, "Tim kerja tidak ditemukan.");
  if (user.role === "ADMIN") return tim;
  if (user.role === "KETUA_TIM" && tim.ketuaId === user.id) return tim;
  if (!opts.tulis && user.role === "PIMPINAN") return tim;
  throw new HttpError(403, "Anda tidak memiliki izin untuk tim kerja ini.");
}

export async function daftarAnggota(timId: string, periodeId?: string) {
  const periode = periodeId
    ? await db.periode.findUnique({ where: { id: periodeId } })
    : await db.periode.findFirst({ where: { status: "AKTIF" } });
  if (!periode) return fail(404, periodeId ? "Periode tidak ditemukan." : "Belum ada periode aktif.");
  const anggota = await db.anggotaTim.findMany({
    where: { timId, periodeId: periode.id },
    include: { user: { select: { id: true, nip: true, nama: true, role: true, jabatan: true, isActive: true } } },
    orderBy: [{ peranDalamTim: "asc" }, { user: { nama: "asc" } }],
  });
  return {
    ok: true as const,
    periode: { id: periode.id, tahun: periode.tahun, bulan: periode.bulan, status: periode.status },
    anggota: anggota.map((a) => ({ anggotaId: a.id, peranDalamTim: a.peranDalamTim, userId: a.user.id, ...a.user })),
  };
}

/**
 * Daftar anggota tim PLUS ketua tim. Ketua dicerminkan dari `TimKerja.ketuaId` (bukan baris
 * AnggotaTim) supaya UI admin menampilkan pemimpin sebagai readonly, sekaligus mencegahnya
 * dipilih ulang dari dropdown "Tambah anggota".
 */
export async function daftarAnggotaDenganKetua(timId: string, periodeId?: string) {
  const r = await daftarAnggota(timId, periodeId);
  if (!r.ok) return r;
  const tim = await db.timKerja.findUnique({
    where: { id: timId },
    select: { ketuaId: true, ketua: { select: { id: true, nip: true, nama: true, role: true, jabatan: true, isActive: true } } },
  });
  if (!tim) return fail(404, "Tim kerja tidak ditemukan.");
  const sudahAda = r.anggota.some((a) => a.userId === tim.ketuaId);
  const anggota = sudahAda
    ? r.anggota
    : [
        {
          anggotaId: null,
          peranDalamTim: "KETUA" as const,
          userId: tim.ketua.id,
          id: tim.ketua.id,
          nip: tim.ketua.nip,
          nama: tim.ketua.nama,
          role: tim.ketua.role,
          jabatan: tim.ketua.jabatan,
          isActive: tim.ketua.isActive,
        },
        ...r.anggota,
      ];
  return { ...r, anggota };
}

export async function ubahAnggota(
  actorId: string,
  tim: { id: string; ketuaId: string },
  input: z.infer<typeof ubahAnggotaSchema>,
  ip: string | null,
) {
  const periode = await db.periode.findUnique({ where: { id: input.periodeId } });
  if (!periode) return fail(404, "Periode tidak ditemukan.");
  if (periode.status === "DIKUNCI") return fail(409, "Periode sudah dikunci; keanggotaan tidak dapat diubah.");

  // Ketua tim Leads the team through TimKerja.ketuaId and is NOT stored as an AnggotaTim row.
  // Rejecting both add and remove keeps a single source of truth and prevents the leader from
  // appearing twice (once as "Ketua" in the member list, once as a regular member).
  if (input.hapus.includes(tim.ketuaId)) {
    return fail(400, "Ketua tim tidak dapat dihapus dari keanggotaan. Ganti ketua tim terlebih dahulu.");
  }
  if (input.tambah.includes(tim.ketuaId)) {
    return fail(400, "Ketua tim sudah menjadi pemimpin tim dan tidak perlu ditambahkan sebagai anggota.");
  }

  if (input.tambah.length) {
    const users = await db.user.findMany({
      where: { id: { in: input.tambah } },
      select: { id: true, role: true, isActive: true, nama: true },
    });
    if (users.length !== new Set(input.tambah).size) return fail(400, "Ada pengguna yang tidak ditemukan.");
    const tidakValid = users.find((u) => !u.isActive || (u.role !== "PEGAWAI" && u.role !== "KETUA_TIM"));
    if (tidakValid) {
      return fail(400, `${tidakValid.nama} tidak dapat menjadi anggota tim (harus pegawai/ketua tim yang aktif).`);
    }
  }

  const [, removed] = await db.$transaction([
    db.anggotaTim.createMany({
      data: [...new Set(input.tambah)].map((userId) => ({
        timId: tim.id,
        userId,
        periodeId: periode.id,
        peranDalamTim: "ANGGOTA" as const,
      })),
      skipDuplicates: true,
    }),
    db.anggotaTim.deleteMany({ where: { timId: tim.id, periodeId: periode.id, userId: { in: input.hapus } } }),
  ]);

  await tulisAudit({
    userId: actorId,
    aksi: "UBAH_ANGGOTA_TIM",
    entitas: "TimKerja",
    entitasId: tim.id,
    metadata: { periodeId: periode.id, tambah: input.tambah, hapus: input.hapus, terhapus: removed.count },
    ipAddress: ip,
  });
  return { ok: true as const };
}

/** Calon anggota tim: seluruh pegawai/ketua tim aktif (tanpa batas halaman), urut nama. */
export function calonAnggota() {
  return db.user.findMany({
    where: { isActive: true, role: { in: ["PEGAWAI", "KETUA_TIM"] } },
    select: { id: true, nama: true, nip: true, role: true },
    orderBy: { nama: "asc" },
  });
}
