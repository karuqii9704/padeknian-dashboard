"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BuktiPicker } from "../bukti/bukti-picker";
import { DaftarBukti, type BuktiView } from "../bukti/daftar-bukti";
import { useAntreanBukti } from "../bukti/use-antrean-bukti";
import { JENIS_EVENT, LABEL_JENIS, SARAN_PERAN, buatEventSchema, type BuatEventInput, type JenisEventNilai } from "@/lib/event-schema";

export type EventAwal = {
  id: string;
  judul: string;
  jenis: JenisEventNilai;
  tanggalMulai: string;
  tanggalSelesai: string;
  lokasi: string;
  peran: string;
  uraianHasil: string;
  lampiran: BuktiView[];
};

type Props = {
  awal?: EventAwal;
  hariIni: string;
  onSaved: () => void;
  onCancel: () => void;
};

const field = "field text-base";
const area = "field py-2 text-base";
const err = "text-xs text-red-700";
const lbl = "flex flex-col gap-1.5 text-sm font-medium text-ink-soft";

const urlLampiran = (eventId: string) => `/api/event/${eventId}/lampiran`;

export function EventForm({ awal, hariIni, onSaved, onCancel }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  // Setelah event tersimpan, pengiriman ulang hanya mengulang unggah lampiran (tidak menyimpan ganda).
  const [tersimpanId, setTersimpanId] = useState<string | null>(null);
  const [lampiran, setLampiran] = useState<BuktiView[]>(awal?.lampiran ?? []);
  const [lampiranBerubah, setLampiranBerubah] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const antrean = useAntreanBukti(lampiran.length, { urlUnggah: urlLampiran, objek: "event" });

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
    control,
  } = useForm<BuatEventInput>({
    resolver: zodResolver(buatEventSchema),
    defaultValues: {
      judul: awal?.judul ?? "",
      jenis: awal?.jenis ?? "RAPAT",
      tanggalMulai: awal?.tanggalMulai ?? hariIni,
      tanggalSelesai: awal?.tanggalSelesai ?? hariIni,
      lokasi: awal?.lokasi ?? "",
      peran: awal?.peran ?? "",
      uraianHasil: awal?.uraianHasil ?? "",
    },
  });
  const mulai = useWatch({ control, name: "tanggalMulai" });

  async function hapusLampiran(b: BuktiView) {
    if (!confirm(`Hapus lampiran "${b.namaAsli}"?`)) return;
    setSibuk(true);
    setServerError(null);
    const res = await fetch(`/api/event-lampiran/${b.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setSibuk(false);
    if (!res.ok) return setServerError(body.pesan ?? "Gagal menghapus lampiran.");
    setLampiran((l) => l.filter((x) => x.id !== b.id));
    setLampiranBerubah(true);
  }

  async function unggahLampiran(id: string) {
    if (!antrean.items.some((i) => i.status !== "selesai")) return onSaved();
    const ok = await antrean.unggahSemua(id);
    if (ok) onSaved();
    else setServerError("Event sudah tersimpan, tetapi ada lampiran yang belum terunggah. Coba lagi, atau tutup dan lampirkan nanti.");
  }

  async function onSubmit(v: BuatEventInput) {
    setServerError(null);
    if (tersimpanId) return unggahLampiran(tersimpanId);
    const res = await fetch(awal ? `/api/event/${awal.id}` : "/api/event", {
      method: awal ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setServerError(body.pesan ?? "Gagal menyimpan event.");
    const id: string = body.event.id;
    setTersimpanId(id);
    await unggahLampiran(id);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{awal ? "Ubah event" : "Lapor event"}</h2>

      <fieldset disabled={!!tersimpanId} className="contents">
        <label className={lbl}>
          Judul event
          <input {...register("judul")} className={field} aria-invalid={!!errors.judul} placeholder="Mis. Rapat koordinasi Susenas" />
          {errors.judul && <span className={err}>{errors.judul.message}</span>}
        </label>

        <label className={lbl}>
          Jenis
          <select {...register("jenis")} className={field}>
            {JENIS_EVENT.map((j) => (
              <option key={j} value={j}>
                {LABEL_JENIS[j]}
              </option>
            ))}
          </select>
          {errors.jenis && <span className={err}>{errors.jenis.message}</span>}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={lbl}>
            Tanggal mulai
            <input
              type="date"
              max={hariIni}
              {...register("tanggalMulai", {
                onChange: (e) => {
                  if (getValues("tanggalSelesai") < e.target.value) setValue("tanggalSelesai", e.target.value);
                },
              })}
              className={field}
              aria-invalid={!!errors.tanggalMulai}
            />
            {errors.tanggalMulai && <span className={err}>{errors.tanggalMulai.message}</span>}
          </label>
          <label className={lbl}>
            Tanggal selesai
            <input type="date" min={mulai} {...register("tanggalSelesai")} className={field} aria-invalid={!!errors.tanggalSelesai} />
            {errors.tanggalSelesai && <span className={err}>{errors.tanggalSelesai.message}</span>}
          </label>
        </div>

        <label className={lbl}>
          Lokasi
          <input {...register("lokasi")} className={field} aria-invalid={!!errors.lokasi} placeholder="Mis. Ruang rapat BPS Kerinci" />
          {errors.lokasi && <span className={err}>{errors.lokasi.message}</span>}
        </label>

        <label className={lbl}>
          Peran Anda
          <input {...register("peran")} list="saran-peran" className={field} aria-invalid={!!errors.peran} placeholder="Mis. Peserta" />
          <datalist id="saran-peran">
            {SARAN_PERAN.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {errors.peran && <span className={err}>{errors.peran.message}</span>}
        </label>

        <label className={lbl}>
          Uraian hasil
          <textarea {...register("uraianHasil")} maxLength={5000} rows={4} className={area} aria-invalid={!!errors.uraianHasil} placeholder="Hasil, kesepakatan, atau tindak lanjut" />
          {errors.uraianHasil && <span className={err}>{errors.uraianHasil.message}</span>}
        </label>
      </fieldset>

      {lampiran.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink-soft">Lampiran yang sudah ada</p>
          <DaftarBukti bukti={lampiran} onHapus={hapusLampiran} sibuk={sibuk || !!tersimpanId} />
        </div>
      )}

      <BuktiPicker antrean={antrean} judul="Dokumentasi (opsional)" objek="event" onCobaLagi={tersimpanId ? () => void unggahLampiran(tersimpanId) : undefined} />

      {tersimpanId && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-900">
          Event tersimpan.
        </p>
      )}
      {serverError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
          {serverError}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
        <button type="button" onClick={tersimpanId || lampiranBerubah ? onSaved : onCancel} disabled={antrean.sedangMengunggah} className="btn btn-secondary">
          {tersimpanId ? "Tutup" : "Batal"}
        </button>
        <button disabled={isSubmitting || antrean.sedangMengunggah || (!!tersimpanId && !antrean.adaGagal)} className="btn btn-primary px-6">
          {antrean.sedangMengunggah ? "Mengunggah lampiran…" : isSubmitting ? "Menyimpan..." : tersimpanId ? "Coba unggah lagi" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
