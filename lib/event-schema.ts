import { z } from "zod";
import { tanggalSchema, uuidSchema } from "@/lib/schemas";

// Skema murni (tanpa dependensi server) yang aman diimpor dari komponen client.

export const JENIS_EVENT = ["RAPAT", "PELATIHAN", "SURVEI_LAPANGAN", "LAINNYA"] as const;
export type JenisEventNilai = (typeof JENIS_EVENT)[number];

export const LABEL_JENIS: Record<JenisEventNilai, string> = {
  RAPAT: "Rapat",
  PELATIHAN: "Pelatihan",
  SURVEI_LAPANGAN: "Survei lapangan",
  LAINNYA: "Lainnya",
};

/** Saran isian "peran" di formulir (boleh diisi bebas). */
export const SARAN_PERAN = ["Peserta", "Panitia", "Narasumber", "Petugas lapangan", "Moderator"];

const teks = (label: string, maks: number) =>
  z.string().trim().min(1, `${label} wajib diisi.`).max(maks, `${label} maksimal ${maks} karakter.`);

const jenis = z.enum(JENIS_EVENT, { message: "Jenis event tidak valid." });

export const buatEventSchema = z
  .object({
    judul: teks("Judul event", 200),
    jenis,
    tanggalMulai: tanggalSchema,
    tanggalSelesai: tanggalSchema,
    lokasi: teks("Lokasi", 200),
    peran: teks("Peran", 80),
    uraianHasil: teks("Uraian hasil", 5000),
  })
  .superRefine((v, ctx) => {
    // Format YYYY-MM-DD terurut sama dengan urutan kalender.
    if (v.tanggalSelesai < v.tanggalMulai) {
      ctx.addIssue({ code: "custom", path: ["tanggalSelesai"], message: "Tanggal selesai tidak boleh sebelum tanggal mulai." });
    }
  });

export const ubahEventSchema = z
  .object({
    judul: teks("Judul event", 200).optional(),
    jenis: jenis.optional(),
    tanggalMulai: tanggalSchema.optional(),
    tanggalSelesai: tanggalSchema.optional(),
    lokasi: teks("Lokasi", 200).optional(),
    peran: teks("Peran", 80).optional(),
    uraianHasil: teks("Uraian hasil", 5000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Tidak ada perubahan yang dikirim." })
  .refine((v) => !(v.tanggalMulai && v.tanggalSelesai) || v.tanggalSelesai >= v.tanggalMulai, {
    path: ["tanggalSelesai"],
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
  });

export const listEventQuery = z.object({
  /** saya: event milik sendiri; tim: event anggota tim milik ketua (khusus KETUA_TIM). */
  cakupan: z.enum(["saya", "tim"]).default("saya"),
  periodeId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  jenis: jenis.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type BuatEventInput = z.infer<typeof buatEventSchema>;
