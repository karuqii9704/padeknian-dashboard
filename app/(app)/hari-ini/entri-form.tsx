"use client";

import { useEffect, useState } from "react";
import { BuktiPicker } from "../bukti/bukti-picker";
import { DaftarBukti, type BuktiView } from "../bukti/daftar-bukti";
import { useAntreanBukti } from "../bukti/use-antrean-bukti";
import { kompresGambar, periksaFileLokal } from "@/lib/bukti-klien";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ADHOC, entriFormSchema, keBodyBaru, keBodyUbah, type EntriFormValues } from "@/lib/entri-form";
import { angkaRingkas } from "@/lib/alokasi-format";
import { labelTanggal } from "@/lib/tanggal-id";

export type AlokasiOpsi = {
  penugasanId: string;
  judul: string;
  satuan: string;
  sisa: number;
  target: number;
  realisasi: number;
  menunggu: number;
  persen: number;
  prioritas: string;
  tanggalSelesai: string;
};

export type EntriAwal = {
  id: string;
  isAdHoc: boolean;
  judulAdHoc: string | null;
  alokasiJudul: string | null;
  tanggal: string;
  deskripsiCapaian: string;
  volume: string;
  satuan: string;
  status: "BELUM_MULAI" | "PROSES" | "SELESAI";
  kendala: string | null;
};

type Props = {
  mode: "baru" | "ubah";
  alokasi: AlokasiOpsi[];
  tanggalOpsi: string[];
  hariIni: string;
  /** Penugasan yang dipilih awal (mode baru). */
  pilihanAwal?: string;
  tanggalAwal?: string;
  awal?: EntriAwal;
  onSaved: () => void;
  onCancel: () => void;
};

const field = "field text-base";
const area = "field py-2 text-base";
const err = "text-xs text-red-700";
const lbl = "flex flex-col gap-1.5 text-sm font-medium text-ink-soft";

export function EntriForm({ mode, alokasi, tanggalOpsi, hariIni, pilihanAwal, tanggalAwal, awal, onSaved, onCancel }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const ubah = mode === "ubah" ? awal : undefined;

  const pilihan0 = ubah ? (ubah.isAdHoc ? ADHOC : "-") : (pilihanAwal ?? alokasi[0]?.penugasanId ?? ADHOC);
  const opsiTanggal = ubah && !tanggalOpsi.includes(ubah.tanggal) ? [ubah.tanggal, ...tanggalOpsi] : tanggalOpsi;
  const awalOpsi = alokasi.find((a) => a.penugasanId === pilihan0);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EntriFormValues>({
    resolver: zodResolver(entriFormSchema),
    defaultValues: {
      pilihan: pilihan0,
      judulAdHoc: ubah?.judulAdHoc ?? "",
      satuanAdHoc: ubah?.isAdHoc ? ubah.satuan : "",
      tanggal: ubah ? ubah.tanggal : (tanggalAwal && opsiTanggal.includes(tanggalAwal) ? tanggalAwal : (opsiTanggal[0] ?? "")),
      deskripsiCapaian: ubah?.deskripsiCapaian ?? "",
      volume: ubah ? angkaRingkas(ubah.volume) : awalOpsi ? angkaRingkas(String(awalOpsi.sisa)) : "1",
      status: ubah?.status ?? "PROSES",
      kendala: ubah?.kendala ?? "",
    },
  });

  const pilihan = watch("pilihan");
  const adhoc = pilihan === ADHOC;
  const opsi = alokasi.find((a) => a.penugasanId === pilihan);
  const satuan = ubah ? ubah.satuan : adhoc ? "" : (opsi?.satuan ?? "");

  // Setelah catatan tersimpan, pengiriman ulang hanya mengulang unggah bukti (tidak menyimpan ganda).
  const [tersimpanId, setTersimpanId] = useState<string | null>(null);
  const [bukti, setBukti] = useState<BuktiView[]>([]);
  const antrean = useAntreanBukti(bukti.length);

  useEffect(() => {
    if (!ubah) return;
    let batal = false;
    fetch(`/api/pekerjaan-harian/${ubah.id}`)
      .then((r) => r.json())
      .then((b) => {
        if (!batal && b.entri) setBukti(b.entri.bukti);
      })
      .catch(() => undefined);
    return () => {
      batal = true;
    };
  }, [ubah]);

  const [buktiBerubah, setBuktiBerubah] = useState(false);
  const [sibukBukti, setSibukBukti] = useState(false);

  async function muatUlangBukti() {
    if (!ubah) return;
    const r = await fetch(`/api/pekerjaan-harian/${ubah.id}`);
    const b = await r.json().catch(() => ({}));
    if (r.ok) setBukti(b.entri.bukti);
  }

  async function hapusBukti(b: BuktiView) {
    if (!confirm(`Hapus bukti "${b.namaAsli}"?`)) return;
    setSibukBukti(true);
    setServerError(null);
    const res = await fetch(`/api/bukti/${b.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setSibukBukti(false);
    if (!res.ok) return setServerError(body.pesan ?? "Gagal menghapus bukti.");
    setBuktiBerubah(true);
    await muatUlangBukti();
  }

  async function gantiBukti(b: BuktiView, asli: File) {
    setServerError(null);
    const g = periksaFileLokal(asli, 0);
    if (g) return setServerError(`${asli.name}: ${g}`);
    setSibukBukti(true);
    const file = await kompresGambar(asli);
    const form = new FormData();
    form.append("file", file, file.name);
    const res = await fetch(`/api/bukti/${b.id}`, { method: "PUT", body: form });
    const body = await res.json().catch(() => ({}));
    setSibukBukti(false);
    if (!res.ok) return setServerError(body.pesan ?? "Gagal mengganti bukti.");
    setBuktiBerubah(true);
    await muatUlangBukti();
  }

  async function unggahBukti(id: string) {
    if (!antrean.items.some((i) => i.status !== "selesai")) return onSaved();
    const ok = await antrean.unggahSemua(id);
    if (ok) onSaved();
    else setServerError("Catatan sudah tersimpan, tetapi ada bukti yang belum terunggah. Coba lagi, atau tutup dan lampirkan nanti.");
  }

  async function onSubmit(v: EntriFormValues) {
    setServerError(null);
    if (tersimpanId) return unggahBukti(tersimpanId);
    const res = ubah
      ? await fetch(`/api/pekerjaan-harian/${ubah.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(keBodyUbah(v, ubah.isAdHoc)),
        })
      : await fetch("/api/pekerjaan-harian", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(keBodyBaru(v)),
        });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setServerError(body.pesan ?? "Gagal menyimpan catatan.");
    const id: string = body.entri.id;
    setTersimpanId(id);
    await unggahBukti(id);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{ubah ? "Perbaiki catatan pekerjaan" : "Catat pekerjaan"}</h2>

      <fieldset disabled={!!tersimpanId} className="contents">

      {ubah ? (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-soft">
          {ubah.isAdHoc ? "Tugas tambahan" : "Alokasi"}: <b>{ubah.alokasiJudul ?? ubah.judulAdHoc}</b>
        </p>
      ) : (
        <label className={lbl}>
          Alokasi pekerjaan
          <select
            {...register("pilihan", {
              onChange: (e) => {
                const o = alokasi.find((a) => a.penugasanId === e.target.value);
                setValue("volume", o ? angkaRingkas(String(o.sisa)) : "1");
              },
            })}
            className={field}
          >
            {alokasi.map((a) => (
              <option key={a.penugasanId} value={a.penugasanId}>
                {a.judul}
              </option>
            ))}
            <option value={ADHOC}>Tugas tambahan (di luar alokasi)</option>
          </select>
          {errors.pilihan && <span className={err}>{errors.pilihan.message}</span>}
        </label>
      )}

      {!ubah && opsi && (
        <p className="-mt-2 rounded-lg bg-brand-50/70 px-3 py-2 text-xs text-brand-800">
          Capaian disetujui {angkaRingkas(String(opsi.realisasi))} / {angkaRingkas(String(opsi.target))} {opsi.satuan} ({opsi.persen}%)
          {opsi.menunggu > 0 && <> · menunggu verifikasi {angkaRingkas(String(opsi.menunggu))}</>}
        </p>
      )}

      {adhoc && (
        <>
          <label className={lbl}>
            Judul tugas tambahan
            <input {...register("judulAdHoc")} className={field} aria-invalid={!!errors.judulAdHoc} />
            {errors.judulAdHoc && <span className={err}>{errors.judulAdHoc.message}</span>}
          </label>
          <label className={lbl}>
            Satuan
            <input {...register("satuanAdHoc")} placeholder="kegiatan, dokumen…" className={field} aria-invalid={!!errors.satuanAdHoc} />
            {errors.satuanAdHoc && <span className={err}>{errors.satuanAdHoc.message}</span>}
          </label>
        </>
      )}

      <label className={lbl}>
        Tanggal
        <select {...register("tanggal")} className={field}>
          {opsiTanggal.map((t) => (
            <option key={t} value={t}>
              {labelTanggal(t)}
              {t === hariIni ? " (hari ini)" : ""}
            </option>
          ))}
        </select>
        {opsiTanggal.length === 0 && <span className={err}>Tidak ada tanggal yang dapat dicatat saat ini.</span>}
        {errors.tanggal && <span className={err}>{errors.tanggal.message}</span>}
      </label>

      <label className={lbl}>
        Deskripsi capaian
        <textarea {...register("deskripsiCapaian")} rows={3} className={area} aria-invalid={!!errors.deskripsiCapaian} />
        {errors.deskripsiCapaian && <span className={err}>{errors.deskripsiCapaian.message}</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={lbl}>
          <span>Volume {satuan && <span className="font-normal text-ink-muted">({satuan})</span>}</span>
          <input {...register("volume")} inputMode="decimal" className={field} aria-invalid={!!errors.volume} />
          {errors.volume && <span className={err}>{errors.volume.message}</span>}
        </label>
        <label className={lbl}>
          Status
          <select {...register("status")} className={field}>
            <option value="BELUM_MULAI">Belum mulai</option>
            <option value="PROSES">Proses</option>
            <option value="SELESAI">Selesai</option>
          </select>
        </label>
      </div>

      <label className={lbl}>
        <span>Kendala <span className="font-normal text-ink-muted">(opsional)</span></span>
        <textarea {...register("kendala")} rows={2} className={area} />
      </label>

      </fieldset>

      {ubah && bukti.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink-soft">Bukti yang sudah dilampirkan</p>
          <DaftarBukti bukti={bukti} onHapus={hapusBukti} onGanti={gantiBukti} sibuk={sibukBukti || !!tersimpanId} />
        </div>
      )}

      <BuktiPicker antrean={antrean} onCobaLagi={tersimpanId ? () => void unggahBukti(tersimpanId) : undefined} />

      {tersimpanId && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-900">
          Catatan tersimpan.
        </p>
      )}
      {serverError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
          {serverError}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
        <button
          type="button"
          onClick={tersimpanId || buktiBerubah ? onSaved : onCancel}
          disabled={antrean.sedangMengunggah}
          className="btn btn-secondary"
        >
          {tersimpanId ? "Tutup" : "Batal"}
        </button>
        <button
          disabled={isSubmitting || antrean.sedangMengunggah || opsiTanggal.length === 0 || (!!tersimpanId && !antrean.adaGagal)}
          className="btn btn-primary px-6"
        >
          {antrean.sedangMengunggah ? "Mengunggah bukti…" : isSubmitting ? "Menyimpan..." : tersimpanId ? "Coba unggah lagi" : "Simpan"}
        </button>
      </div>
    </form>
  );
}
