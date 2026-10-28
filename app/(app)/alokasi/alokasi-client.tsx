"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { angkaRingkas, formatDaftarWhatsApp, tanggalPendek } from "@/lib/alokasi-format";
import { AlokasiForm, type Anggota, type KegiatanOpsi } from "./alokasi-form";
import { ProgressBar } from "./progress-bar";
import { SalinDialog } from "./salin-dialog";
import { IkonUnduh } from "../../ui/icons";
import { Alert, EmptyState, PageHeader } from "../../ui/primitives";

type Periode = { id: string; tahun: number; bulan: number; status: string; tanggalMulai: string; tanggalSelesai: string };
type Tim = { id: string; nama: string; ketua: { id: string } };
type Alokasi = {
  id: string;
  judul: string;
  deskripsi: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  targetVolume: string;
  satuan: string;
  prioritas: string;
  status: string;
  alasanPembatalan: string | null;
  ringkasan: { target: number; realisasi: number; menunggu: number; persen: number };
  penugasan: { id: string; userId: string; nama: string; targetVolume: string; realisasi: number; menunggu: number; persen: number }[];
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const PRIORITAS_LABEL: Record<string, string> = { RENDAH: "Rendah", SEDANG: "Sedang", TINGGI: "Tinggi" };
const btn = "btn btn-secondary";

async function api(url: string) {
  const res = await fetch(url);
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

type Awal = { periodes: Periode[]; tims: Tim[]; kegiatan: KegiatanOpsi[]; periodeId: string; timId: string; rows: Alokasi[]; anggota: Anggota[] };

export function AlokasiClient({ role, awal }: { meId: string; role: string; awal: Awal }) {
  const periodes = awal.periodes;
  const tims = awal.tims;
  const kegiatan = awal.kegiatan;
  const [periodeId, setPeriodeId] = useState(awal.periodeId);
  const [timId, setTimId] = useState(awal.timId);
  const [rows, setRows] = useState<Alokasi[]>(awal.rows);
  const [anggota, setAnggota] = useState<Anggota[]>(awal.anggota);
  // Data awal sudah ikut HTML: muat ulang hanya saat filter berubah atau setelah aksi.
  const pertama = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [salinOpen, setSalinOpen] = useState(false);
  const [batal, setBatal] = useState<Alokasi | null>(null);
  const [alasan, setAlasan] = useState("");
  const [batalError, setBatalError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const batalDialog = useRef<HTMLDialogElement>(null);

  const bisaTambah = role === "KETUA_TIM";
  const periode = periodes.find((p) => p.id === periodeId);
  const tim = tims.find((t) => t.id === timId);

  const loadRows = useCallback(async () => {
    if (!periodeId) return;
    const q = new URLSearchParams({ periodeId });
    if (timId) q.set("timId", timId);
    const r = await api(`/api/alokasi?${q}`);
    if (!r.ok) return setError(r.body.pesan ?? "Gagal memuat alokasi.");
    setError(null);
    setRows(r.body.data);
  }, [periodeId, timId]);

  useEffect(() => {
    if (pertama.current) return;
    loadRows();
  }, [loadRows]);

  const loadAnggota = useCallback(async () => {
    if (!bisaTambah || !timId || !periodeId) return setAnggota([]);
    const r = await api(`/api/tim/${timId}/anggota?periodeId=${periodeId}`);
    setAnggota(r.ok ? r.body.anggota : []);
  }, [bisaTambah, timId, periodeId]);

  useEffect(() => {
    if (pertama.current) {
      pertama.current = false; // efek terakhir yang membaca penanda ini pada render pertama
      return;
    }
    loadAnggota();
  }, [loadAnggota]);

  useEffect(() => {
    if (batal) batalDialog.current?.showModal();
    else batalDialog.current?.close();
  }, [batal]);

  useEffect(() => {
    if (formOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [formOpen]);

  const header = periode ? `Alokasi ${BULAN[periode.bulan - 1]} ${periode.tahun}${tim ? ` — ${tim.nama}` : ""}` : "Alokasi";
  const teks = () => formatDaftarWhatsApp(header, rows.filter((r) => r.status !== "DIBATALKAN"));

  async function salin() {
    try {
      await navigator.clipboard.writeText(teks());
      setInfo("Daftar disalin. Tempel di grup WhatsApp.");
    } catch {
      setInfo("Gagal menyalin otomatis. Gunakan tombol Unduh.");
    }
  }
  async function kirimBatal(e: React.FormEvent) {
    e.preventDefault();
    if (!batal) return;
    if (!alasan.trim()) return setBatalError("Alasan pembatalan wajib diisi.");
    const res = await fetch(`/api/alokasi/${batal.id}/batalkan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alasan }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setBatalError(body.pesan ?? "Gagal membatalkan alokasi.");
    setBatal(null);
    setAlasan("");
    setBatalError(null);
    setInfo("Alokasi dibatalkan.");
    loadRows();
  }
  async function hapus(a: Alokasi) {
    if (!confirm(`Hapus alokasi "${a.judul}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    const res = await fetch(`/api/alokasi/${a.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.pesan ?? "Gagal menghapus alokasi.");
    setError(null);
    setInfo("Alokasi dihapus.");
    loadRows();
  }
  function unduh() {
    const blob = new Blob([teks()], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `alokasi-${periode?.tahun ?? ""}-${String(periode?.bulan ?? "").padStart(2, "0")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Penugasan"
        judul="Alokasi Pekerjaan"
        aksi={
          bisaTambah && (
            <>
              <button onClick={() => setSalinOpen(true)} disabled={!tim || !periode || periode.status === "DIKUNCI"} className="btn btn-secondary">
                Salin dari bulan lalu
              </button>
              <button onClick={() => setFormOpen(true)} disabled={!tim || !periode || periode.status === "DIKUNCI"} className="btn btn-primary">
                + Tambah alokasi
              </button>
            </>
          )
        }
      />

      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} className="field w-auto min-w-44 text-sm" aria-label="Periode">
          {periodes.map((p) => <option key={p.id} value={p.id}>{BULAN[p.bulan - 1]} {p.tahun} ({p.status})</option>)}
        </select>
        <select value={timId} onChange={(e) => setTimId(e.target.value)} className="field w-auto min-w-44 text-sm" aria-label="Tim kerja">
          {role !== "KETUA_TIM" && <option value="">Semua tim</option>}
          {tims.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
        </select>
        <div className="flex gap-2 sm:ml-auto">
          <button onClick={salin} className="btn btn-ghost">Salin untuk WhatsApp</button>
          <button onClick={unduh} className="btn btn-ghost"><IkonUnduh className="h-4 w-4" />Unduh .txt</button>
        </div>
      </div>

      {error && <Alert nada="galat">{error}</Alert>}
      {info && <Alert nada="sukses">{info}</Alert>}

      <ul className="grid gap-3 lg:grid-cols-2">
        {rows.map((a) => {
          const batalkan = a.status === "DIBATALKAN";
          return (
            <li key={a.id} className={`panel flex flex-col p-4 ${batalkan ? "!bg-surface-muted text-ink-muted" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className={`font-semibold leading-snug ${batalkan ? "line-through" : ""}`}>{a.judul}</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {tanggalPendek(a.tanggalMulai)} – {tanggalPendek(a.tanggalSelesai)} · Prioritas {PRIORITAS_LABEL[a.prioritas]} · {a.status}
                  </p>
                  {batalkan && a.alasanPembatalan && <p className="text-xs">Alasan pembatalan: {a.alasanPembatalan}</p>}
                </div>
                <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-100">Target {angkaRingkas(a.targetVolume)} {a.satuan}/orang</span>
              </div>
              {!batalkan && a.penugasan.length > 1 && (
                <div className="mt-3 rounded-lg bg-surface-muted p-2.5 text-xs text-ink-soft">
                  Total: {angkaRingkas(String(a.ringkasan.realisasi))} / {angkaRingkas(String(a.ringkasan.target))} {a.satuan}
                  <ProgressBar persen={a.ringkasan.persen} label="Progres total alokasi" />
                </div>
              )}
              <ul className="mt-3 space-y-2.5">
                {a.penugasan.map((p) => (
                  <li key={p.id} className="text-sm">
                    <div className="mb-0.5 flex flex-wrap justify-between gap-x-2">
                      <span>{p.nama}</span>
                      <span>
                        {angkaRingkas(String(p.realisasi))} / {angkaRingkas(p.targetVolume)} {a.satuan}
                        {p.menunggu > 0 && <span className="text-xs text-amber-700"> (+{angkaRingkas(String(p.menunggu))} menunggu verifikasi)</span>}
                      </span>
                    </div>
                    <ProgressBar persen={p.persen} label={`Progres ${p.nama}`} />
                  </li>
                ))}
              </ul>
              {bisaTambah && !batalkan && periode?.status !== "DIKUNCI" && (
                <div className="mt-auto flex gap-2 border-t border-line pt-3 [&:not(:first-child)]:mt-4">
                  <button onClick={() => { setBatal(a); setAlasan(""); setBatalError(null); }} className={btn}>Batalkan</button>
                  <button onClick={() => hapus(a)} className="btn btn-ghost text-red-700 hover:!bg-red-50 hover:!text-red-800">Hapus</button>
                </div>
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="panel lg:col-span-2">
            <EmptyState
              judul="Belum ada alokasi pada periode ini."
              keterangan={bisaTambah ? "Tambahkan alokasi baru, atau salin alokasi dari bulan lalu." : "Ketua tim akan membagikan alokasi pekerjaan di sini."}
            />
          </li>
        )}
      </ul>

      <dialog ref={dialog} onClose={() => setFormOpen(false)} className="m-auto max-h-[90vh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto p-5">
        {formOpen && tim && periode && (
          <AlokasiForm
            key={`${tim.id}-${periode.id}-${anggota.length}`}
            timId={tim.id}
            periodeId={periode.id}
            rentang={{ mulai: periode.tanggalMulai.slice(0, 10), selesai: periode.tanggalSelesai.slice(0, 10) }}
            anggota={anggota}
            kegiatan={kegiatan}
            onSaved={() => {
              setFormOpen(false);
              setInfo("Alokasi tersimpan.");
              loadRows();
            }}
            onCancel={() => setFormOpen(false)}
          />
        )}
      </dialog>
      <dialog ref={batalDialog} onClose={() => setBatal(null)} className="m-auto w-[calc(100%-1rem)] max-w-md p-5">
        {batal && (
          <form onSubmit={kirimBatal} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Batalkan alokasi</h2>
            <p className="text-sm">&ldquo;{batal.judul}&rdquo; akan ditandai dibatalkan. Entri yang sudah ada tetap tersimpan.</p>
            <label className="flex flex-col gap-1 text-sm">Alasan pembatalan
              <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={3} className="field py-2" />
            </label>
            {batalError && <p role="alert" className="text-xs text-red-700">{batalError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setBatal(null)} className={btn}>Kembali</button>
              <button className="btn btn-danger">Batalkan alokasi</button>
            </div>
          </form>
        )}
      </dialog>

      {bisaTambah && tim && periode && (
        <SalinDialog
          open={salinOpen}
          timId={tim.id}
          periodeTujuanId={periode.id}
          rentang={{ mulai: periode.tanggalMulai.slice(0, 10), selesai: periode.tanggalSelesai.slice(0, 10) }}
          anggota={anggota}
          kegiatan={kegiatan}
          onClose={() => setSalinOpen(false)}
          onDone={(n) => {
            setSalinOpen(false);
            setInfo(n > 0 ? `${n} alokasi disalin dan disimpan.` : "Tidak ada alokasi yang disimpan.");
            loadRows();
          }}
        />
      )}
    </main>
  );
}
