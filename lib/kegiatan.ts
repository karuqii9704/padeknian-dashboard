import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";

export type ServiceError = { ok: false; status: 404 | 409; pesan: string };

const kode = z
  .string()
  .trim()
  .max(40, "Kode maksimal 40 karakter.")
  .transform((v) => (v === "" ? null : v));
const satuan = z
  .string()
  .trim()
  .max(30, "Satuan maksimal 30 karakter.")
  .transform((v) => (v === "" ? null : v));

export const buatKegiatanSchema = z.object({
  kode: kode.nullish(),
  uraian: z.string().trim().min(1, "Uraian wajib diisi.").max(1000, "Uraian maksimal 1000 karakter."),
  satuanDefault: satuan.nullish(),
});

export const ubahKegiatanSchema = z
  .object({
    kode: kode.nullish(),
    uraian: z.string().trim().min(1, "Uraian wajib diisi.").max(1000, "Uraian maksimal 1000 karakter.").optional(),
    satuanDefault: satuan.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan yang dikirim." });

export const listKegiatanQuery = z.object({
  aktif: z.enum(["true", "false"]).optional(),
  // ID kegiatan non-aktif yang masih direferensikan data lama; tetap disertakan di dropdown.
  sertakan: z.string().uuid().optional(),
});

export async function daftarKegiatan(q: z.infer<typeof listKegiatanQuery>) {
  const where: Prisma.KegiatanWhereInput =
    q.aktif === undefined
      ? {}
      : q.sertakan
        ? { OR: [{ isActive: q.aktif === "true" }, { id: q.sertakan }] }
        : { isActive: q.aktif === "true" };
  return db.kegiatan.findMany({ where, orderBy: [{ isActive: "desc" }, { uraian: "asc" }] });
}

async function kodeBentrok(kodeBaru: string | null | undefined, selfId?: string) {
  if (!kodeBaru) return false;
  const ada = await db.kegiatan.findUnique({ where: { kode: kodeBaru }, select: { id: true } });
  return !!ada && ada.id !== selfId;
}

export async function buatKegiatan(actorId: string, input: z.infer<typeof buatKegiatanSchema>, ip: string | null) {
  if (await kodeBentrok(input.kode)) {
    return { ok: false, status: 409, pesan: "Kode kegiatan sudah dipakai." } satisfies ServiceError;
  }
  const kegiatan = await db.kegiatan.create({
    data: { kode: input.kode ?? null, uraian: input.uraian, satuanDefault: input.satuanDefault ?? null },
  });
  await tulisAudit({
    userId: actorId,
    aksi: "BUAT_KEGIATAN",
    entitas: "Kegiatan",
    entitasId: kegiatan.id,
    metadata: { kode: kegiatan.kode, uraian: kegiatan.uraian },
    ipAddress: ip,
  });
  return { ok: true as const, kegiatan };
}

export async function ubahKegiatan(
  actorId: string,
  id: string,
  input: z.infer<typeof ubahKegiatanSchema>,
  ip: string | null,
) {
  const before = await db.kegiatan.findUnique({ where: { id } });
  if (!before) return { ok: false, status: 404, pesan: "Kegiatan tidak ditemukan." } satisfies ServiceError;
  if (input.kode !== undefined && (await kodeBentrok(input.kode, id))) {
    return { ok: false, status: 409, pesan: "Kode kegiatan sudah dipakai." } satisfies ServiceError;
  }
  const kegiatan = await db.kegiatan.update({
    where: { id },
    data: {
      ...(input.kode !== undefined ? { kode: input.kode } : {}),
      ...(input.uraian !== undefined ? { uraian: input.uraian } : {}),
      ...(input.satuanDefault !== undefined ? { satuanDefault: input.satuanDefault } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  await tulisAudit({
    userId: actorId,
    aksi: "UBAH_KEGIATAN",
    entitas: "Kegiatan",
    entitasId: id,
    metadata: { sebelum: before, sesudah: kegiatan },
    ipAddress: ip,
  });
  return { ok: true as const, kegiatan };
}
