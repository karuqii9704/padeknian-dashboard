"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { angkaRingkas } from "@/lib/alokasi-format";
import { labelTanggal } from "@/lib/tanggal-id";
import { DaftarBukti, type BuktiView } from "../bukti/daftar-bukti";
import { IndikatorBukti } from "../bukti/indikator-bukti";
import { IkonCentang } from "../../ui/icons";
import { Alert, EmptyState, PageHeader } from "../../ui/primitives";

export type EntriAntrean = {
  id: string;
  tanggal: string;
  user: { id: string; nama: string; nip: string };
  isAdHoc: boolean;
  judulAdHoc: string | null;
  alokasi: { id: string; judul: string } | null;
  deskripsiCapaian: string;
  volume: string;
  satuan: string;
  status: "BELUM_MULAI" | "PROSES" | "SELESAI";
  kendala: string | null;
  isBackfill: boolean;
  jumlahBukti: number;
  diajukanSejak: string;
  bukti: BuktiView[];
  verifikasi: { id: string; aksi: string; catatan: string | null; verifikator: { nama: string }; createdAt: string }[];
};

const STATUS_LABEL: Record<string, string> = { BELUM_MULAI: "Belum mulai", PROSES: "Proses", SELESAI: "Selesai" };
const AKSI_LABEL: Record<string, string> = { SETUJUI: "Disetujui", MINTA_REVISI: "Diminta revisi", TOLAK: "Ditolak" };

/** Lama menunggu dalam teks singkat ("3 hari", "5 jam", "baru saja"). */
export function lamaMenunggu(iso: string, sekarang = Date.now()) {
  const menit = Math.max(0, Math.floor((sekarang - new Date(iso).getTime()) / 60000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam`;
  return `${Math.floor(jam / 24)} hari`;
}

const MIN_CATATAN = 10;
const AKSI_HASIL: Record<string, string> = { SETUJUI: "disetujui", MINTA_REVISI: "diminta revisi", TOLAK: "ditolak" };

export function VerifikasiClient({ awal }: { awal: { rows: EntriAntrean[]; total: number } }) {
  const router = useRouter();
  const [rows, setRows] = useState<EntriAntrean[] | null>(awal.rows);
  const [total, setTotal] = useState(awal.total);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [catatanUntuk, setCatatanUntuk] = useState<{ entri: EntriAntrean; aksi: "MINTA_REVISI" | "TOLAK" } | null>(null);
  const [catatan, setCatatan] = useState("");
  const [galatCatatan, setGalatCatatan] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogBulk = useRef<HTMLDialogElement>(null);
  const [pilihanMentah, setTerpilih] = useState<Set<string>>(new Set());
  const [konfirmasiBulk, setKonfirmasiBulk] = useState(false);
  const [prosesBulk, setProsesBulk] = useState(false);
  const [galatBulk, setGalatBulk] = useState<{ pesan: string; masalah: { id: string; pesan: string }[] } | null>(null);
  const [hasilBulk, setHasilBulk] = useState<{ id: string; tanggal: string }[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/verifikasi/antrean?pageSize=100");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.pesan ?? "Gagal memuat antrean verifikasi.");
    setError(null);
    setRows(body.data);
    setTotal(body.total);
  }, []);

  useEffect(() => {
    if (catatanUntuk) dialog.current?.showModal();
    else dialog.current?.close();
  }, [catatanUntuk]);

  useEffect(() => {
    if (konfirmasiBulk) dialogBulk.current?.showModal();
    else dialogBulk.current?.close();
  }, [konfirmasiBulk]);

  // Pilihan yang sudah tidak ada di antrean (mis. diproses di perangkat lain) diabaikan (diturunkan saat render).
  const terpilih = useMemo(() => {
    if (!rows) return pilihanMentah;
    const ada = new Set(rows.map((r) => r.id));
    return [...pilihanMentah].every((id) => ada.has(id)) ? pilihanMentah : new Set([...pilihanMentah].filter((id) => ada.has(id)));
  }, [pilihanMentah, rows]);

  function togglePilih(id: string) {
    setTerpilih((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function jalankanBulk() {
    setProsesBulk(true);
    setGalatBulk(null);
    const res = await fetch("/api/verifikasi/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [...terpilih] }),
    });
    const body = await res.json().catch(() => ({}));
    setProsesBulk(false);
    if (!res.ok) {
      setGalatBulk({ pesan: body.pesan ?? "Gagal menyetujui catatan terpilih.", masalah: body.masalah ?? [] });
      await load(); // antrean mungkin berubah; pilihan yang sudah tidak valid akan terbuang
      return;
    }
    setKonfirmasiBulk(false);
    setHasilBulk(body.hasil);
    setInfo(`${body.jumlah} catatan disetujui.`);
    setTerpilih(new Set());
    await load();
    router.refresh();
  }

  async function kirim(e: EntriAntrean, aksi: "SETUJUI" | "MINTA_REVISI" | "TOLAK", teks?: string) {
    setSibuk(e.id);
    setError(null);
    const res = await fetch(`/api/pekerjaan-harian/${e.id}/verifikasi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aksi, catatan: teks }),
    });
    const body = await res.json().catch(() => ({}));
    setSibuk(null);
    if (!res.ok) {
      if (res.status === 409) await load(); // sudah berubah di sisi lain: muat ulang antrean
      return { ok: false as const, pesan: body.pesan ?? "Gagal menyimpan verifikasi." };
    }
    setInfo(`Catatan ${e.user.nama} ${AKSI_HASIL[aksi]}.`);
    await load();
    router.refresh(); // perbarui badge antrean pada navigasi
    return { ok: true as const };
  }

  async function setujui(e: EntriAntrean) {
    const r = await kirim(e, "SETUJUI");
    if (!r.ok) setError(r.pesan);
  }

  async function kirimDenganCatatan(ev: React.FormEvent) {
    ev.preventDefault();
    if (!catatanUntuk) return;
    if (catatan.trim().length < MIN_CATATAN) return setGalatCatatan(`Catatan minimal ${MIN_CATATAN} karakter.`);
    const r = await kirim(catatanUntuk.entri, catatanUntuk.aksi, catatan.trim());
    if (!r.ok) return setGalatCatatan(r.pesan);
    setCatatanUntuk(null);
    setCatatan("");
    setGalatCatatan(null);
  }

  const nama = new Map((rows ?? []).map((r) => [r.id, r.user.nama]));
  const dipilihList = (rows ?? [])
    .filter((r) => terpilih.has(r.id))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.user.nama.localeCompare(b.user.nama));

  if (!rows) return <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6"><Alert nada="galat">{error ?? "Gagal memuat antrean verifikasi."}</Alert></main>;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Tim"
        judul="Verifikasi"
        keterangan={<span aria-live="polite">{total} catatan menunggu verifikasi, diurutkan dari yang paling lama menunggu.</span>}
      />

      {info && <Alert nada="sukses">{info}</Alert>}
      {hasilBulk && (
        <section aria-label="Hasil setujui terpilih" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-950">
          <p className="font-medium">Hasil per catatan</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {hasilBulk.map((h) => (
              <li key={h.id} className="flex items-center gap-1.5">
                <IkonCentang className="h-3.5 w-3.5 shrink-0 text-green-700" /> {nama.get(h.id) ?? h.id} — {labelTanggal(h.tanggal)}: Disetujui
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setHasilBulk(null)} className="btn btn-secondary mt-3">Tutup hasil</button>
        </section>
      )}

      {rows.length > 0 && (
        <div className="panel sticky top-16 z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2 shadow-[0_12px_24px_-16px_rgb(8_47_33/0.3)]">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-brand-700"
              checked={terpilih.size === rows.length}
              onChange={(e) => setTerpilih(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
            />
            Pilih semua ({rows.length})
          </label>
          <button type="button"
            disabled={terpilih.size === 0}
            onClick={() => { setGalatBulk(null); setKonfirmasiBulk(true); }}
            className="btn btn-primary"
          >
            Setujui terpilih ({terpilih.size})
          </button>
        </div>
      )}
      {error && <Alert nada="galat">{error}</Alert>}

      <ul className="space-y-3">
        {rows.map((e) => (
          <li key={e.id} className={`panel p-4 transition-shadow ${terpilih.has(e.id) ? "ring-2 ring-brand-300" : ""}`} data-entri={e.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <label className="flex min-h-11 min-w-11 items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 accent-brand-700"
                  aria-label={`Pilih catatan ${e.user.nama} ${e.tanggal}`}
                  checked={terpilih.has(e.id)}
                  onChange={() => togglePilih(e.id)}
                />
              </label>
              <div className="flex-1">
                <h2 className="font-semibold">{e.user.nama}</h2>
                <p className="text-xs text-ink-muted">
                  {labelTanggal(e.tanggal)}
                  {e.isBackfill && <span className="ml-1.5 rounded-md bg-track px-1.5 py-0.5 text-[11px] text-ink-soft">diisi mundur</span>}
                </p>
              </div>
              <span className="rounded-full bg-gold-50 px-2.5 py-0.5 text-xs font-medium text-gold-700 ring-1 ring-inset ring-gold-200">Menunggu {lamaMenunggu(e.diajukanSejak)}</span>
            </div>
            <div className="mt-3 rounded-lg bg-surface-muted p-3">
            <p className="text-sm font-medium">{e.alokasi?.judul ?? `${e.judulAdHoc} (tugas tambahan)`}</p>
            <p className="text-sm text-ink-soft">{e.deskripsiCapaian}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {angkaRingkas(e.volume)} {e.satuan} · {STATUS_LABEL[e.status]}
              {e.kendala && <> · Kendala: {e.kendala}</>}
            </p>
            </div>

            {e.verifikasi.length > 0 && (
              <p className="mt-2 rounded-lg border-l-[3px] border-gold-400 bg-gold-50/60 px-3 py-1.5 text-xs text-ink-soft">
                Verifikasi sebelumnya: {AKSI_LABEL[e.verifikasi[e.verifikasi.length - 1].aksi]}
                {e.verifikasi[e.verifikasi.length - 1].catatan && <> — “{e.verifikasi[e.verifikasi.length - 1].catatan}”</>}
              </p>
            )}

            <div className="mt-2">
              <IndikatorBukti jumlah={e.jumlahBukti} />
              <div className="mt-1">{e.bukti.length > 0 && <DaftarBukti bukti={e.bukti} />}</div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3" role="group" aria-label={`Aksi verifikasi ${e.user.nama}`}>
              <button type="button" disabled={sibuk === e.id} onClick={() => setujui(e)} className="btn btn-primary px-2">
                Setujui
              </button>
              <button type="button"
                disabled={sibuk === e.id}
                onClick={() => { setCatatanUntuk({ entri: e, aksi: "MINTA_REVISI" }); setCatatan(""); setGalatCatatan(null); }}
                className="btn border border-amber-300 bg-surface px-2 text-amber-900 hover:bg-amber-50"
              >
                Minta revisi
              </button>
              <button type="button"
                disabled={sibuk === e.id}
                onClick={() => { setCatatanUntuk({ entri: e, aksi: "TOLAK" }); setCatatan(""); setGalatCatatan(null); }}
                className="btn border border-red-300 bg-surface px-2 text-red-800 hover:bg-red-50"
              >
                Tolak
              </button>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="panel">
            <EmptyState judul="Tidak ada catatan yang menunggu verifikasi." keterangan="Catatan baru dari anggota tim akan muncul di sini, diurutkan dari yang paling lama menunggu." />
          </li>
        )}
      </ul>

      <dialog ref={dialogBulk} onClose={() => setKonfirmasiBulk(false)} aria-label="Konfirmasi setujui terpilih" className="m-auto max-h-[90vh] w-[calc(100%-1rem)] max-w-md overflow-y-auto p-5">
        {konfirmasiBulk && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Setujui {dipilihList.length} catatan?</h2>
            <p className="text-sm text-ink-soft">Tanggal yang akan disetujui:</p>
            <ul className="max-h-60 space-y-0.5 overflow-y-auto rounded-lg border border-line bg-surface-muted p-2.5 text-sm">
              {dipilihList.map((r) => (
                <li key={r.id}>
                  {labelTanggal(r.tanggal)} — {r.user.nama}
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-soft">Seluruh pilihan diproses sekaligus; bila ada yang tidak valid, tidak ada yang disetujui.</p>
            {galatBulk && (
              <div role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
                <p>{galatBulk.pesan}</p>
                {galatBulk.masalah.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    {galatBulk.masalah.map((m) => (
                      <li key={m.id}>{nama.get(m.id) ?? m.id}: {m.pesan}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setKonfirmasiBulk(false)} disabled={prosesBulk} className="btn btn-secondary">Batal</button>
              <button type="button" onClick={jalankanBulk} disabled={prosesBulk || dipilihList.length === 0} className="btn btn-primary">
                {prosesBulk ? "Memproses…" : `Setujui ${dipilihList.length} catatan`}
              </button>
            </div>
          </div>
        )}
      </dialog>

      <dialog ref={dialog} aria-label="Catatan verifikasi" onClose={() => setCatatanUntuk(null)} className="m-auto w-[calc(100%-1rem)] max-w-md p-5">
        {catatanUntuk && (
          <form onSubmit={kirimDenganCatatan} noValidate className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{catatanUntuk.aksi === "TOLAK" ? "Tolak catatan" : "Minta revisi"}</h2>
            <p className="text-sm text-ink-soft">
              {catatanUntuk.entri.user.nama} · {labelTanggal(catatanUntuk.entri.tanggal)}
            </p>
            <label className="flex flex-col gap-1 text-sm">
              Catatan untuk pegawai
              <textarea value={catatan} onChange={(ev) => setCatatan(ev.target.value)} maxLength={2000} rows={4} className="field py-2 text-base" aria-invalid={!!galatCatatan} />
              <span className="text-xs text-ink-soft">Minimal {MIN_CATATAN} karakter ({catatan.trim().length} diisi).</span>
            </label>
            {galatCatatan && <p role="alert" className="text-xs text-red-700">{galatCatatan}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCatatanUntuk(null)} className="btn btn-secondary">Batal</button>
              <button className={`btn ${catatanUntuk.aksi === "TOLAK" ? "btn-danger" : "btn-warn"}`}>
                {catatanUntuk.aksi === "TOLAK" ? "Tolak" : "Kirim permintaan revisi"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </main>
  );
}
