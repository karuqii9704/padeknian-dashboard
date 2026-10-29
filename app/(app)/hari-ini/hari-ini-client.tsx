"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { angkaRingkas } from "@/lib/alokasi-format";
import { labelTanggal, tanggalSingkat } from "@/lib/tanggal-id";
import { ProgressBar } from "../alokasi/progress-bar";
import { BuktiEntri } from "../bukti/indikator-bukti";
import { CatatanVerifikasi } from "../catatan-verifikasi";
import { StatusBadge } from "../status-badge";
import { EntriForm, type AlokasiOpsi, type EntriAwal } from "./entri-form";
import { Alert, EmptyState, PageHeader } from "../../ui/primitives";

type Entri = {
  id: string;
  tanggal: string;
  isAdHoc: boolean;
  judulAdHoc: string | null;
  alokasi: { id: string; judul: string } | null;
  deskripsiCapaian: string;
  volume: string;
  satuan: string;
  status: "BELUM_MULAI" | "PROSES" | "SELESAI";
  kendala: string | null;
  statusVerifikasi: string;
  jumlahBukti: number;
  periodeDikunci: boolean;
  verifikasiTerakhir: { aksi: string; catatan: string | null; verifikator: string; createdAt: string } | null;
};
type Data = {
  hariIni: string;
  hariKerja: boolean;
  keterangan: string | null;
  periode: { id: string; tahun: number; bulan: number } | null;
  tanggalBolehDicatat: string[];
  entriHariIni: Entri[];
  jumlahEntriHariIni: number;
  alokasi: AlokasiOpsi[];
};

const PRIORITAS_LABEL: Record<string, string> = { RENDAH: "Rendah", SEDANG: "Sedang", TINGGI: "Tinggi" };
const STATUS_LABEL: Record<string, string> = { BELUM_MULAI: "Belum mulai", PROSES: "Proses", SELESAI: "Selesai" };

export function HariIniClient({ awal, bukaForm = false }: { awal: Data; bukaForm?: boolean }) {
  const [data, setData] = useState<Data | null>(awal);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // ?catat=1 (aksi cepat dari Beranda) langsung membuka form bila pencatatan memungkinkan.
  const [form, setForm] = useState<{ mode: "baru"; pilihan?: string } | { mode: "ubah"; awal: EntriAwal } | null>(
    bukaForm && awal.periode && awal.tanggalBolehDicatat.length > 0 ? { mode: "baru" } : null,
  );
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/hari-ini");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.pesan ?? "Gagal memuat data.");
    setError(null);
    setData(body);
  }, []);

  useEffect(() => {
    if (form) dialog.current?.showModal();
    else dialog.current?.close();
  }, [form]);

  async function hapus(e: Entri) {
    if (!confirm("Hapus catatan ini?")) return;
    const res = await fetch(`/api/pekerjaan-harian/${e.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.pesan ?? "Gagal menghapus catatan.");
    setInfo("Catatan dihapus.");
    load();
  }

  if (!data) return <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6"><Alert nada="galat">{error ?? "Gagal memuat data."}</Alert></main>;

  const sudah = data.jumlahEntriHariIni > 0;
  const bisaCatat = !!data.periode && data.tanggalBolehDicatat.length > 0;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader eyebrow="Pekerjaan saya" judul="Hari Ini" keterangan={labelTanggal(data.hariIni)} />

      <div className="panel flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span aria-hidden className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold tabular-nums ${sudah ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100" : "bg-gold-50 text-gold-700 ring-1 ring-gold-200"}`}>
            {data.jumlahEntriHariIni}
          </span>
          <div className="min-w-0 text-sm">
            {!data.periode ? (
              <p className="font-medium text-amber-900">Belum ada periode aktif. Hubungi admin.</p>
            ) : !data.hariKerja ? (
              <p className="text-ink-soft">
                {data.keterangan}. Anda tetap dapat mencatat untuk hari kerja sebelumnya (maksimal 3 hari kalender ke belakang).
              </p>
            ) : sudah ? (
              <p role="status" className="font-medium text-brand-800">
                Sudah ada {data.jumlahEntriHariIni} catatan hari ini.
              </p>
            ) : (
              <p role="status" className="font-medium text-gold-700">
                Belum ada catatan pekerjaan hari ini.
              </p>
            )}
            <p className="text-xs text-ink-muted">{data.alokasi.length} alokasi berjalan pada periode ini</p>
          </div>
        </div>
        <button onClick={() => setForm({ mode: "baru" })} disabled={!bisaCatat} className="btn btn-primary min-h-12 w-full px-6 text-base sm:w-auto">
          + Catat Pekerjaan
        </button>
      </div>

      {error && <Alert nada="galat">{error}</Alert>}
      {info && <Alert nada="sukses">{info}</Alert>}

      <section aria-labelledby="h-alokasi">
        <h2 id="h-alokasi" className="mb-2.5 text-[15px] font-semibold">Alokasi berjalan</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.alokasi.map((a) => (
            <li key={a.penugasanId} className="panel flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium leading-snug">{a.judul}</h3>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Prioritas {PRIORITAS_LABEL[a.prioritas]} · sampai {tanggalSingkat(a.tanggalSelesai)}
                  </p>
                </div>
                <button onClick={() => setForm({ mode: "baru", pilihan: a.penugasanId })} disabled={!bisaCatat} className="btn btn-secondary shrink-0 px-3">
                  Catat
                </button>
              </div>
              <p className="mb-1.5 mt-auto pt-3 text-xs text-ink-soft">
                {angkaRingkas(String(a.realisasi))} / {angkaRingkas(String(a.target))} {a.satuan}
                {a.menunggu > 0 && <span className="text-amber-700"> (+{angkaRingkas(String(a.menunggu))} menunggu verifikasi)</span>}
              </p>
              <ProgressBar persen={a.persen} label={`Progres ${a.judul}`} />
            </li>
          ))}
          {data.alokasi.length === 0 && (
            <li className="panel sm:col-span-2">
              <EmptyState kecil judul="Belum ada alokasi untuk Anda pada periode ini." keterangan="Pekerjaan di luar alokasi tetap dapat dicatat sebagai tugas tambahan." />
            </li>
          )}
        </ul>
      </section>

      <section aria-labelledby="h-catatan">
        <h2 id="h-catatan" className="mb-2.5 text-[15px] font-semibold">Catatan hari ini</h2>
        <ul className="space-y-3">
          {data.entriHariIni.map((e) => (
            <li key={e.id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{e.alokasi?.judul ?? e.judulAdHoc}</h3>
                <StatusBadge status={e.statusVerifikasi} />
              </div>
              <p className="mt-1 text-sm">{e.deskripsiCapaian}</p>
              <p className="mt-1 text-xs text-ink-muted">
                {angkaRingkas(e.volume)} {e.satuan} · {STATUS_LABEL[e.status]}
                {e.kendala && <> · Kendala: {e.kendala}</>}
              </p>
              <CatatanVerifikasi terakhir={e.verifikasiTerakhir} statusVerifikasi={e.statusVerifikasi} />
              <BuktiEntri entriId={e.id} jumlah={e.jumlahBukti} />
              {e.statusVerifikasi !== "DISETUJUI" && !e.periodeDikunci && (
                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <button
                    onClick={() =>
                      setForm({
                        mode: "ubah",
                        awal: {
                          id: e.id,
                          isAdHoc: e.isAdHoc,
                          judulAdHoc: e.judulAdHoc,
                          alokasiJudul: e.alokasi?.judul ?? null,
                          tanggal: e.tanggal,
                          deskripsiCapaian: e.deskripsiCapaian,
                          volume: e.volume,
                          satuan: e.satuan,
                          status: e.status,
                          kendala: e.kendala,
                        },
                      })
                    }
                    className="btn btn-secondary"
                  >
                    Ubah
                  </button>
                  <button onClick={() => hapus(e)} className="btn btn-ghost text-red-700 hover:!bg-red-50 hover:!text-red-800">Hapus</button>
                </div>
              )}
            </li>
          ))}
          {data.entriHariIni.length === 0 && (
            <li className="panel">
              <EmptyState kecil judul="Belum ada catatan." keterangan="Tekan + Catat Pekerjaan, atau tombol Catat pada salah satu alokasi." />
            </li>
          )}
        </ul>
      </section>

      <dialog ref={dialog} onClose={() => setForm(null)} className="m-auto max-h-[92vh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto p-5">
        {form && (
          <EntriForm
            key={form.mode === "ubah" ? form.awal.id : `baru-${form.pilihan ?? ""}`}
            mode={form.mode}
            alokasi={data.alokasi}
            tanggalOpsi={data.tanggalBolehDicatat}
            hariIni={data.hariIni}
            pilihanAwal={form.mode === "baru" ? form.pilihan : undefined}
            awal={form.mode === "ubah" ? form.awal : undefined}
            onSaved={() => {
              setForm(null);
              setInfo("Catatan tersimpan.");
              load();
            }}
            onCancel={() => setForm(null)}
          />
        )}
      </dialog>
    </main>
  );
}
