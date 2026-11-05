import { z } from "zod";
import { PRIORITAS } from "@/lib/schemas";

/** "12,5" atau "12.5" -> 12.5; kosong/tidak valid -> NaN. */
export function parseAngka(s: string) {
  const t = s.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

const angkaPositif = (nama: string) => (s: string) => {
  const n = parseAngka(s);
  if (Number.isNaN(n)) return `${nama} harus berupa angka.`;
  if (n <= 0) return `${nama} harus lebih dari 0.`;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return `${nama} maksimal 2 angka desimal.`;
  return null;
};

export const alokasiFormSchema = z
  .object({
    judul: z.string().trim().min(1, "Judul wajib diisi.").max(200, "Judul maksimal 200 karakter."),
    deskripsi: z.string().trim().min(1, "Deskripsi wajib diisi.").max(5000, "Deskripsi maksimal 5000 karakter."),
    tanggalMulai: z.string().min(1, "Tanggal mulai wajib diisi."),
    tanggalSelesai: z.string().min(1, "Tanggal selesai wajib diisi."),
    targetVolume: z.string().trim().min(1, "Target volume wajib diisi."),
    satuan: z.string().trim().min(1, "Satuan wajib diisi.").max(30, "Satuan maksimal 30 karakter."),
    prioritas: z.enum(PRIORITAS, { message: "Prioritas wajib dipilih." }),
    kegiatanId: z.string().optional(),
    penerima: z.array(
      z.object({ userId: z.string(), nama: z.string(), dipilih: z.boolean(), targetVolume: z.string() }),
    ),
  })
  .superRefine((v, ctx) => {
    const errTarget = angkaPositif("Target volume")(v.targetVolume);
    if (errTarget && v.targetVolume.trim() !== "") ctx.addIssue({ code: "custom", path: ["targetVolume"], message: errTarget });
    if (v.tanggalMulai && v.tanggalSelesai && v.tanggalSelesai < v.tanggalMulai) {
      ctx.addIssue({ code: "custom", path: ["tanggalSelesai"], message: "Tanggal selesai tidak boleh sebelum tanggal mulai." });
    }
    if (!v.penerima.some((p) => p.dipilih)) {
      ctx.addIssue({ code: "custom", path: ["penerima"], message: "Pilih minimal satu penerima." });
    }
    v.penerima.forEach((p, i) => {
      if (!p.dipilih || p.targetVolume.trim() === "") return;
      const e = angkaPositif(`Target ${p.nama}`)(p.targetVolume);
      if (e) ctx.addIssue({ code: "custom", path: ["penerima", i, "targetVolume"], message: e });
    });
  });

export type AlokasiFormValues = z.infer<typeof alokasiFormSchema>;

/** Ubah nilai form menjadi body POST /api/alokasi. */
export function keBodyApi(v: AlokasiFormValues, timId: string, periodeId: string) {
  return {
    timId,
    periodeId,
    judul: v.judul,
    deskripsi: v.deskripsi,
    tanggalMulai: v.tanggalMulai,
    tanggalSelesai: v.tanggalSelesai,
    targetVolume: parseAngka(v.targetVolume),
    satuan: v.satuan,
    prioritas: v.prioritas,
    kegiatanId: v.kegiatanId ? v.kegiatanId : null,
    penugasan: v.penerima
      .filter((p) => p.dipilih)
      .map((p) => ({
        userId: p.userId,
        ...(p.targetVolume.trim() !== "" ? { targetVolume: parseAngka(p.targetVolume) } : {}),
      })),
  };
}
