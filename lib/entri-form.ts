import { z } from "zod";
import { parseAngka } from "@/lib/alokasi-form";

/** Nilai dropdown untuk "Tugas Tambahan (ad-hoc)"; selain itu berisi penugasanId. */
export const ADHOC = "ADHOC";

const STATUS = ["BELUM_MULAI", "PROSES", "SELESAI"] as const;

export const entriFormSchema = z
  .object({
    pilihan: z.string().min(1, "Pilih alokasi pekerjaan."),
    judulAdHoc: z.string().trim().max(200, "Judul maksimal 200 karakter.").optional(),
    satuanAdHoc: z.string().trim().max(30, "Satuan maksimal 30 karakter.").optional(),
    tanggal: z.string().min(1, "Tanggal wajib diisi."),
    deskripsiCapaian: z.string().trim().min(1, "Deskripsi capaian wajib diisi."),
    volume: z.string().trim().min(1, "Volume wajib diisi."),
    status: z.enum(STATUS, { message: "Status pekerjaan wajib dipilih." }),
    kendala: z.string().trim().optional(),
  })
  .superRefine((v, ctx) => {
    const n = parseAngka(v.volume);
    if (v.volume.trim() !== "") {
      if (Number.isNaN(n)) ctx.addIssue({ code: "custom", path: ["volume"], message: "Volume harus berupa angka." });
      else if (n < 0) ctx.addIssue({ code: "custom", path: ["volume"], message: "Volume tidak boleh negatif." });
      else if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) {
        ctx.addIssue({ code: "custom", path: ["volume"], message: "Volume maksimal 2 angka desimal." });
      }
    }
    if (v.pilihan === ADHOC) {
      if (!v.judulAdHoc) ctx.addIssue({ code: "custom", path: ["judulAdHoc"], message: "Judul tugas tambahan wajib diisi." });
      if (!v.satuanAdHoc) ctx.addIssue({ code: "custom", path: ["satuanAdHoc"], message: "Satuan wajib diisi." });
    }
  });

export type EntriFormValues = z.infer<typeof entriFormSchema>;

/** Body POST /api/pekerjaan-harian. */
export function keBodyBaru(v: EntriFormValues) {
  const adhoc = v.pilihan === ADHOC;
  return {
    isAdHoc: adhoc,
    ...(adhoc ? { judulAdHoc: v.judulAdHoc, satuan: v.satuanAdHoc } : { penugasanId: v.pilihan }),
    tanggal: v.tanggal,
    deskripsiCapaian: v.deskripsiCapaian,
    volume: parseAngka(v.volume),
    status: v.status,
    kendala: v.kendala ? v.kendala : null,
  };
}

/** Body PATCH /api/pekerjaan-harian/:id. Alokasi tidak dapat dipindah; hanya isi entri. */
export function keBodyUbah(v: EntriFormValues, adhoc: boolean) {
  return {
    tanggal: v.tanggal,
    deskripsiCapaian: v.deskripsiCapaian,
    volume: parseAngka(v.volume),
    status: v.status,
    kendala: v.kendala ? v.kendala : null,
    ...(adhoc ? { judulAdHoc: v.judulAdHoc, satuan: v.satuanAdHoc } : {}),
  };
}
