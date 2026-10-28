import { z } from "zod";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { generateTempPassword } from "@/lib/temp-password";
import { passwordBaruSchema } from "@/lib/password-change";

const ROLES = ["PEGAWAI", "KETUA_TIM", "PIMPINAN", "ADMIN"] as const;

export const publicUserSelect = {
  id: true,
  nip: true,
  nama: true,
  email: true,
  role: true,
  jabatan: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Format email tidak valid.")
  .max(160, "Email maksimal 160 karakter.");

export const buatPenggunaSchema = z.object({
  nip: z.string().trim().regex(/^\d{8,18}$/, "NIP harus 8-18 digit angka."),
  nama: z.string().trim().min(1, "Nama wajib diisi.").max(120, "Nama maksimal 120 karakter."),
  email: emailField.optional().or(z.literal("").transform(() => undefined)),
  role: z.enum(ROLES, { message: "Peran tidak valid." }),
  jabatan: z.string().trim().max(120, "Jabatan maksimal 120 karakter.").optional(),
  password: passwordBaruSchema.optional(),
});

export const ubahPenggunaSchema = z
  .object({
    nama: z.string().trim().min(1, "Nama wajib diisi.").max(120).optional(),
    email: emailField.nullable().optional().or(z.literal("").transform(() => null)),
    jabatan: z.string().trim().max(120).nullable().optional(),
    role: z.enum(ROLES, { message: "Peran tidak valid." }).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan yang dikirim." });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(ROLES).optional(),
  aktif: z.enum(["true", "false"]).optional(),
  q: z.string().trim().max(120).optional(),
});

export type ServiceError = { ok: false; status: 400 | 404 | 409; pesan: string };

export async function daftarPengguna(query: z.infer<typeof listQuerySchema>) {
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.aktif ? { isActive: query.aktif === "true" } : {}),
    ...(query.q
      ? {
          OR: [
            { nama: { contains: query.q, mode: "insensitive" } },
            { nip: { contains: query.q } },
            { email: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [data, total] = await Promise.all([
    db.user.findMany({
      where,
      select: publicUserSelect,
      orderBy: [{ nama: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.user.count({ where }),
  ]);
  return { data, total, page: query.page, pageSize: query.pageSize };
}

export async function buatPengguna(
  actorId: string,
  input: z.infer<typeof buatPenggunaSchema>,
  ip: string | null,
) {
  const dup = await db.user.findFirst({
    where: { OR: [{ nip: input.nip }, ...(input.email ? [{ email: input.email }] : [])] },
    select: { nip: true },
  });
  if (dup) {
    const pesan = dup.nip === input.nip ? "NIP sudah terdaftar." : "Email sudah terdaftar.";
    return { ok: false, status: 409, pesan } satisfies ServiceError;
  }

  const sementara = input.password ?? generateTempPassword();
  const user = await db.user.create({
    data: {
      nip: input.nip,
      nama: input.nama,
      email: input.email ?? null,
      role: input.role,
      jabatan: input.jabatan || null,
      passwordHash: await hashPassword(sementara),
      mustChangePassword: true,
    },
    select: publicUserSelect,
  });
  await tulisAudit({
    userId: actorId,
    aksi: "BUAT_PENGGUNA",
    entitas: "User",
    entitasId: user.id,
    metadata: { sesudah: { nip: user.nip, nama: user.nama, role: user.role } },
    ipAddress: ip,
  });
  return { ok: true as const, user, passwordSementara: sementara };
}

export async function ubahPengguna(
  actorId: string,
  targetId: string,
  input: z.infer<typeof ubahPenggunaSchema>,
  ip: string | null,
) {
  const before = await db.user.findUnique({ where: { id: targetId }, select: publicUserSelect });
  if (!before) return { ok: false, status: 404, pesan: "Pengguna tidak ditemukan." } satisfies ServiceError;

  if (targetId === actorId) {
    if (input.role !== undefined && input.role !== before.role) {
      return { ok: false, status: 400, pesan: "Anda tidak dapat mengubah peran akun Anda sendiri." } satisfies ServiceError;
    }
    if (input.isActive === false) {
      return { ok: false, status: 400, pesan: "Anda tidak dapat menonaktifkan akun Anda sendiri." } satisfies ServiceError;
    }
  }

  if (input.role !== undefined && input.role !== before.role && before.role === "KETUA_TIM") {
    const memimpin = await db.timKerja.count({ where: { ketuaId: targetId, isActive: true } });
    if (memimpin > 0) {
      return { ok: false, status: 409, pesan: "Pengguna masih menjadi ketua tim aktif. Ganti ketua tim terlebih dahulu." } satisfies ServiceError;
    }
  }

  if (input.email && input.email !== before.email) {
    const dup = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (dup) return { ok: false, status: 409, pesan: "Email sudah terdaftar." } satisfies ServiceError;
  }

  const user = await db.user.update({
    where: { id: targetId },
    data: {
      ...(input.nama !== undefined ? { nama: input.nama } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.jabatan !== undefined ? { jabatan: input.jabatan || null } : {}),
      ...(input.role !== undefined ? { role: input.role as Role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: publicUserSelect,
  });

  const log = (aksi: string, sebelum: Prisma.InputJsonValue, sesudah: Prisma.InputJsonValue) =>
    tulisAudit({
      userId: actorId,
      aksi,
      entitas: "User",
      entitasId: targetId,
      metadata: { sebelum, sesudah },
      ipAddress: ip,
    });

  if (user.role !== before.role) await log("UBAH_PERAN", { role: before.role }, { role: user.role });
  if (user.isActive !== before.isActive) {
    await log(user.isActive ? "AKTIFKAN_AKUN" : "NONAKTIF_AKUN", { isActive: before.isActive }, { isActive: user.isActive });
  }
  const profilSebelum = { nama: before.nama, email: before.email, jabatan: before.jabatan };
  const profilSesudah = { nama: user.nama, email: user.email, jabatan: user.jabatan };
  if (JSON.stringify(profilSebelum) !== JSON.stringify(profilSesudah)) {
    await log("UBAH_PROFIL", profilSebelum, profilSesudah);
  }
  return { ok: true as const, user };
}

export async function resetPassword(actorId: string, targetId: string, ip: string | null) {
  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) return { ok: false, status: 404, pesan: "Pengguna tidak ditemukan." } satisfies ServiceError;

  const sementara = generateTempPassword();
  await db.$transaction([
    db.userPasswordHistory.create({ data: { userId: targetId, passwordHash: target.passwordHash } }),
    db.user.update({
      where: { id: targetId },
      data: { passwordHash: await hashPassword(sementara), mustChangePassword: true },
    }),
    db.loginAttempt.deleteMany({ where: { identifier: { in: [target.nip, (target.email ?? "").toLowerCase()] } } }),
  ]);
  await tulisAudit({
    userId: actorId,
    aksi: "RESET_PASSWORD",
    entitas: "User",
    entitasId: targetId,
    metadata: { sebelum: { mustChangePassword: target.mustChangePassword }, sesudah: { mustChangePassword: true } },
    ipAddress: ip,
  });
  return { ok: true as const, passwordSementara: sementara };
}
