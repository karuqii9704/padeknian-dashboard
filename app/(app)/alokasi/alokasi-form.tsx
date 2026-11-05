"use client";

import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { alokasiFormSchema, keBodyApi, type AlokasiFormValues } from "@/lib/alokasi-form";
import { angkaRingkas } from "@/lib/alokasi-format";

export type Anggota = { userId: string; nama: string; nip: string };
export type KegiatanOpsi = { id: string; kode: string | null; uraian: string };

export type Draft = {
  judul: string;
  deskripsi: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  targetVolume: string;
  satuan: string;
  prioritas: "RENDAH" | "SEDANG" | "TINGGI";
  kegiatanId: string | null;
  penugasan: { userId: string; nama: string; targetVolume: string; tersedia: boolean }[];
};

type Props = {
  /** Nilai awal (mis. hasil salin dari periode sebelumnya). */
  awal?: Draft;
  judulForm?: string;
  onSkip?: () => void;
  timId: string;
  periodeId: string;
  rentang: { mulai: string; selesai: string };
  anggota: Anggota[];
  kegiatan: KegiatanOpsi[];
  onSaved: () => void;
  onCancel: () => void;
};

const field = "field";
const err = "text-xs text-red-700";

export function AlokasiForm({ awal, judulForm = "Tambah alokasi", onSkip, timId, periodeId, rentang, anggota, kegiatan, onSaved, onCancel }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AlokasiFormValues>({
    resolver: zodResolver(alokasiFormSchema),
    defaultValues: {
      judul: awal?.judul ?? "",
      deskripsi: awal?.deskripsi ?? "",
      tanggalMulai: awal?.tanggalMulai ?? rentang.mulai,
      tanggalSelesai: awal?.tanggalSelesai ?? rentang.selesai,
      targetVolume: awal ? angkaRingkas(awal.targetVolume) : "",
      satuan: awal?.satuan ?? "",
      prioritas: awal?.prioritas ?? "SEDANG",
      kegiatanId: awal?.kegiatanId ?? "",
      penerima: anggota.map((a) => {
        const p = awal?.penugasan.find((x) => x.userId === a.userId);
        return { userId: a.userId, nama: a.nama, dipilih: !!p, targetVolume: p ? angkaRingkas(p.targetVolume) : "" };
      }),
    },
  });
  const { fields } = useFieldArray({ control, name: "penerima" });
  const penerima = watch("penerima");
  const targetUmum = watch("targetVolume");

  useEffect(() => {
    setServerError(null);
  }, [timId, periodeId]);

  async function onSubmit(values: AlokasiFormValues) {
    setServerError(null);
    const res = await fetch("/api/alokasi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(keBodyApi(values, timId, periodeId)),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setServerError(body.pesan ?? "Gagal menyimpan alokasi.");
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{judulForm}</h2>
      {awal && awal.penugasan.some((p) => !p.tersedia) && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dilewati karena bukan anggota tim pada periode ini: {awal.penugasan.filter((p) => !p.tersedia).map((p) => p.nama).join(", ")}.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">Judul
        <input {...register("judul")} className={field} aria-invalid={!!errors.judul} />
        {errors.judul && <span className={err}>{errors.judul.message}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">Deskripsi
        <textarea {...register("deskripsi")} maxLength={5000} rows={3} className="rounded border px-3 py-2" aria-invalid={!!errors.deskripsi} />
        {errors.deskripsi && <span className={err}>{errors.deskripsi.message}</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">Target volume
          <input {...register("targetVolume")} inputMode="decimal" className={field} aria-invalid={!!errors.targetVolume} />
          {errors.targetVolume && <span className={err}>{errors.targetVolume.message}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">Satuan
          <input {...register("satuan")} placeholder="dokumen, desa, laporan…" className={field} aria-invalid={!!errors.satuan} />
          {errors.satuan && <span className={err}>{errors.satuan.message}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">Tanggal mulai
          <input type="date" min={rentang.mulai} max={rentang.selesai} {...register("tanggalMulai")} className={field} aria-invalid={!!errors.tanggalMulai} />
          {errors.tanggalMulai && <span className={err}>{errors.tanggalMulai.message}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">Tanggal selesai
          <input type="date" min={rentang.mulai} max={rentang.selesai} {...register("tanggalSelesai")} className={field} aria-invalid={!!errors.tanggalSelesai} />
          {errors.tanggalSelesai && <span className={err}>{errors.tanggalSelesai.message}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">Prioritas
          <select {...register("prioritas")} className={field}>
            <option value="RENDAH">Rendah</option>
            <option value="SEDANG">Sedang</option>
            <option value="TINGGI">Tinggi</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">Kegiatan (opsional)
          <select {...register("kegiatanId")} className={field}>
            <option value="">— tanpa kegiatan —</option>
            {kegiatan.map((k) => <option key={k.id} value={k.id}>{k.kode ? `${k.kode} · ` : ""}{k.uraian}</option>)}
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Penerima &amp; target per orang</legend>
        {fields.length === 0 && <p className="text-sm text-ink-muted">Tim belum punya anggota pada periode ini.</p>}
        {fields.map((f, i) => (
          <div key={f.id} className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-11 min-w-40 flex-1 items-center gap-2 text-sm">
              <input type="checkbox" {...register(`penerima.${i}.dipilih`)} className="h-5 w-5" />
              {f.nama}
            </label>
            <input
              {...register(`penerima.${i}.targetVolume`)}
              inputMode="decimal"
              disabled={!penerima?.[i]?.dipilih}
              placeholder={targetUmum ? `${targetUmum} (default)` : "target"}
              aria-label={`Target ${f.nama}`}
              className="min-h-11 w-40 rounded border px-3 disabled:bg-track"
            />
            {errors.penerima?.[i]?.targetVolume && <span className={err}>{errors.penerima[i]?.targetVolume?.message}</span>}
          </div>
        ))}
        {errors.penerima?.message && <span className={err}>{errors.penerima.message}</span>}
        {errors.penerima?.root?.message && <span className={err}>{errors.penerima.root.message}</span>}
      </fieldset>

      {serverError && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</p>}

      <div className="flex justify-end gap-2">
        {onSkip && <button type="button" onClick={onSkip} className="min-h-11 rounded border px-3 text-sm">Lewati</button>}
        <button type="button" onClick={onCancel} className="min-h-11 rounded border px-3 text-sm">Batal</button>
        <button disabled={isSubmitting} className="btn btn-primary disabled:opacity-60">
          {isSubmitting ? "Menyimpan..." : "Simpan alokasi"}
        </button>
      </div>
    </form>
  );
}
