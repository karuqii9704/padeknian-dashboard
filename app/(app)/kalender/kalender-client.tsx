"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { angkaRingkas } from "@/lib/alokasi-format";
import { labelTanggal } from "@/lib/tanggal-id";
import { BuktiEntri } from "../bukti/indikator-bukti";
import { CatatanVerifikasi } from "../catatan-verifikasi";
import { StatusBadge } from "../status-badge";
import { EntriForm, type AlokasiOpsi, type EntriAwal } from "../hari-ini/entri-form";
import { IkonKanan, IkonKiri } from "../../ui/icons";
import { Alert, PageHeader } from "../../ui/primitives";

type StatusHari = "KOSONG" | "MENUNGGU" | "DISETUJUI" | "REVISI";
type Hari = { tanggal: string; hariKerja: boolean; libur: string | null; akhirPekan: boolean; status: StatusHari | null; jumlah: number };
type Kal = {
  userId: string;
  periode: { id: string; tahun: number; bulan: number; status: string };
  hariIni: string;
  hari: Hari[];
  ringkas: { hariKerja: number; terisi: number; belumTerisi: number; revisi: number };
};
type PeriodeOpsi = { id: string; tahun: number; bulan: number };
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
type Konteks = { hariIni: string; tanggalBolehDicatat: string[]; alokasi: AlokasiOpsi[] };

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const NAMA_HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const WARNA: Record<StatusHari, { cls: string; simbol: string; label: string }> = {
  KOSONG: { cls: "bg-surface border-line-strong text-ink hover:border-brand-400", simbol: "○", label: "Belum ada catatan" },
  MENUNGGU: { cls: "bg-gold-50 border-gold-300 text-gold-700 hover:border-gold-500", simbol: "◐", label: "Menunggu verifikasi" },
  DISETUJUI: { cls: "bg-brand-50 border-brand-300 text-brand-800 hover:border-brand-500", simbol: "✓", label: "Disetujui" },
  REVISI: { cls: "bg-red-50 border-red-300 text-red-800 hover:border-red-500", simbol: "!", label: "Perlu revisi" },
};

async function getJson(url: string) {
  const res = await fetch(url);
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

export function KalenderClient({ awal }: { awal: { kal: Kal | null; periodes: PeriodeOpsi[]; konteks: Konteks } }) {
  const [kal, setKal] = useState<Kal | null>(awal.kal);
  const periodes = awal.periodes;
  const [konteks, setKonteks] = useState<Konteks | null>(awal.konteks);
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [entri, setEntri] = useState<Entri[]>([]);
  const [error, setError] = useState<string | null>(awal.kal ? null : "Belum ada periode.");
  const [form, setForm] = useState<{ mode: "baru"; tanggal: string } | { mode: "ubah"; awal: EntriAwal } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async (periodeId?: string) => {
    const [k, c] = await Promise.all([getJson(`/api/kalender${periodeId ? `?periodeId=${periodeId}` : ""}`), getJson("/api/hari-ini")]);
    if (!k.ok) return setError(k.body.pesan ?? "Gagal memuat kalender.");
    setError(null);
    setKal(k.body);
    if (c.ok) setKonteks({ hariIni: c.body.hariIni, tanggalBolehDicatat: c.body.tanggalBolehDicatat, alokasi: c.body.alokasi });
  }, []);

  useEffect(() => {
    // Tautan dari notifikasi: /kalender?tanggal=YYYY-MM-DD membuka detail hari tersebut.
    const t = new URLSearchParams(window.location.search).get("tanggal");
    if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) setDipilih(t);
  }, []);

  const loadEntri = useCallback(async () => {
    if (!dipilih || !kal) return setEntri([]);
    const r = await getJson(`/api/pekerjaan-harian?userId=${kal.userId}&tanggalDari=${dipilih}&tanggalSampai=${dipilih}`);
    setEntri(r.ok ? r.body.data : []);
  }, [dipilih, kal]);

  useEffect(() => {
    loadEntri();
  }, [loadEntri]);

  useEffect(() => {
    if (form) dialog.current?.showModal();
    else dialog.current?.close();
  }, [form]);

  if (!kal) return <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6"><Alert nada="galat">{error ?? "Gagal memuat kalender."}</Alert></main>;

  const idx = periodes.findIndex((p) => p.id === kal.periode.id);
  const awalMinggu = (new Date(`${kal.hari[0].tanggal}T00:00:00Z`).getUTCDay() + 6) % 7; // Senin = 0
  const bisaCatatHari = (t: string) => !!konteks?.tanggalBolehDicatat.includes(t);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Pekerjaan saya"
        judul="Kalender"
        aksi={
          <div className="panel flex items-center gap-1 p-1">
            <button aria-label="Bulan sebelumnya" disabled={idx <= 0} onClick={() => { setDipilih(null); load(periodes[idx - 1].id); }} className="btn btn-ghost size-11 px-0">
              <IkonKiri className="h-4 w-4" />
            </button>
            <span className="min-w-36 text-center text-sm font-semibold text-brand-900" aria-live="polite">{BULAN[kal.periode.bulan - 1]} {kal.periode.tahun}</span>
            <button aria-label="Bulan berikutnya" disabled={idx < 0 || idx >= periodes.length - 1} onClick={() => { setDipilih(null); load(periodes[idx + 1].id); }} className="btn btn-ghost size-11 px-0">
              <IkonKanan className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="panel p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Terisi <b className="text-brand-800">{kal.ringkas.terisi}</b> dari {kal.ringkas.hariKerja} hari kerja
          {kal.ringkas.belumTerisi > 0 && <> · <b>{kal.ringkas.belumTerisi}</b> hari kerja belum terisi</>}
          {kal.ringkas.revisi > 0 && <> · <b className="text-red-700">{kal.ringkas.revisi}</b> perlu revisi</>}
        </p>
        <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 sm:w-40">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${kal.ringkas.hariKerja ? (kal.ringkas.terisi / kal.ringkas.hariKerja) * 100 : 0}%` }} />
        </div>
      </div>

      <div role="group" aria-label={`Kalender ${BULAN[kal.periode.bulan - 1]} ${kal.periode.tahun}`} className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {NAMA_HARI.map((n) => (
          <div key={n} aria-hidden className="py-1 text-center text-[11px] font-medium text-ink-muted">{n}</div>
        ))}
        {Array.from({ length: awalMinggu }).map((_, i) => <div key={`k${i}`} aria-hidden />)}
        {kal.hari.map((h) => {
          const tgl = Number(h.tanggal.slice(8));
          const w = h.status ? WARNA[h.status] : null;
          const ket = h.libur ?? (h.akhirPekan ? "Akhir pekan" : w?.label);
          return (
            <button
              key={h.tanggal}
              data-tanggal={h.tanggal}
              data-status={h.status ?? "LIBUR"}
              aria-label={`${labelTanggal(h.tanggal)}: ${ket}${h.jumlah ? `, ${h.jumlah} catatan` : ""}`}
              aria-pressed={dipilih === h.tanggal}
              onClick={() => setDipilih(h.tanggal)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-lg border text-sm tabular-nums transition-[border-color,box-shadow] sm:min-h-14 ${w ? w.cls : "border-transparent bg-[repeating-linear-gradient(135deg,var(--color-gray-100)_0_4px,transparent_4px_8px)] text-ink-muted"} ${
                dipilih === h.tanggal ? "ring-2 ring-brand-700 ring-offset-1" : ""
              } ${h.tanggal === kal.hariIni ? "font-bold underline decoration-gold-500 decoration-2 underline-offset-4" : ""}`}
            >
              <span>{tgl}</span>
              <span aria-hidden className="text-xs leading-none">{w ? w.simbol : ""}</span>
            </button>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs text-ink-muted" aria-label="Keterangan warna">
        {(Object.keys(WARNA) as StatusHari[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`inline-flex size-5 items-center justify-center rounded-md border text-[10px] ${WARNA[s].cls}`}>{WARNA[s].simbol}</span>
            {WARNA[s].label}
          </li>
        ))}
      </ul>
      </div>

      {dipilih && (
        <section aria-live="polite" className="panel animate-masuk space-y-3 p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold">{labelTanggal(dipilih)}</h2>
          {kal.hari.find((h) => h.tanggal === dipilih)?.libur && (
            <p className="text-sm text-ink-muted">Hari libur: {kal.hari.find((h) => h.tanggal === dipilih)?.libur}</p>
          )}
          <ul className="space-y-2">
            {entri.map((e) => (
              <li key={e.id} className="rounded border p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.alokasi?.judul ?? e.judulAdHoc}</span>
                  <StatusBadge status={e.statusVerifikasi} />
                </div>
                <p className="text-sm">{e.deskripsiCapaian}</p>
                <p className="text-xs text-ink-muted">{angkaRingkas(e.volume)} {e.satuan}</p>
                <CatatanVerifikasi terakhir={e.verifikasiTerakhir} statusVerifikasi={e.statusVerifikasi} />
                <BuktiEntri entriId={e.id} jumlah={e.jumlahBukti} />
                {e.periodeDikunci && <p className="mt-1 text-xs text-ink-muted">Periode dikunci — catatan hanya dapat dibaca.</p>}
                {e.statusVerifikasi !== "DISETUJUI" && !e.periodeDikunci && (
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
                    className="btn btn-secondary mt-2"
                  >
                    Ubah
                  </button>
                )}
              </li>
            ))}
            {entri.length === 0 && <li className="rounded-lg bg-surface-muted px-3 py-4 text-center text-sm text-ink-muted">Belum ada catatan pada tanggal ini.</li>}
          </ul>
          {bisaCatatHari(dipilih) ? (
            <button onClick={() => setForm({ mode: "baru", tanggal: dipilih })} className="btn btn-primary">+ Catat untuk tanggal ini</button>
          ) : (
            <p className="text-xs text-ink-muted">Pencatatan hanya untuk hari kerja hari ini atau maksimal 3 hari kalender ke belakang.</p>
          )}
        </section>
      )}

      <dialog ref={dialog} onClose={() => setForm(null)} className="m-auto max-h-[92vh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto p-5">
        {form && konteks && (
          <EntriForm
            key={form.mode === "ubah" ? form.awal.id : `baru-${form.tanggal}`}
            mode={form.mode}
            alokasi={konteks.alokasi}
            tanggalOpsi={konteks.tanggalBolehDicatat}
            hariIni={konteks.hariIni}
            tanggalAwal={form.mode === "baru" ? form.tanggal : undefined}
            awal={form.mode === "ubah" ? form.awal : undefined}
            onSaved={() => {
              setForm(null);
              load(kal.periode.id);
              loadEntri();
            }}
            onCancel={() => setForm(null)}
          />
        )}
      </dialog>
    </main>
  );
}
