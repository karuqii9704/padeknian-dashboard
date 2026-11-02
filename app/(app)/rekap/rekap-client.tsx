"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Alert, EmptyState } from "../../ui/primitives";

type Rekap = { id: string; isFinal: boolean; versi: number; status: "QUEUED" | "PROSES" | "SELESAI" | "GAGAL"; errorMessage: string | null; adaXlsx: boolean; adaPdf: boolean; dibuatPada: string; selesaiPada: string | null };
type Baris = { userId: string; nama: string; nip: string; tim: string[]; rekap: Rekap | null; jumlahVersi: number };
type Daftar = { periode: { id: string; tahun: number; bulan: number; status: string }; sedangBerjalan: boolean; data: Baris[] };
type Versi = Rekap & { digeneratOleh: string };
type PeriodeOpsi = { id: string; tahun: number; bulan: number; status: string };

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const STATUS: Record<string, { label: string; cls: string }> = {
  QUEUED: { label: "Dalam antrean", cls: "bg-track text-ink-soft ring-track-strong" },
  PROSES: { label: "Diproses…", cls: "bg-gold-50 text-gold-700 ring-gold-200 animate-pulse dark:text-gold-300" },
  SELESAI: { label: "Selesai", cls: "bg-brand-50 text-brand-700 ring-brand-200 dark:text-brand-300" },
  GAGAL: { label: "Gagal", cls: "bg-red-50 text-red-800 ring-red-200 dark:text-red-300" },
};
const POLL_MS = 1500;

async function getJson(url: string) {
  const res = await fetch(url);
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

export function RekapClient({ role, awal }: { role: string; awal: { periodes: PeriodeOpsi[]; periodeId: string; data: Daftar | null } }) {
  const [periodes, setPeriodes] = useState<PeriodeOpsi[]>(awal.periodes);
  const [periodeId, setPeriodeId] = useState(awal.periodeId);
  const [data, setData] = useState<Daftar | null>(awal.data);
  const pertama = useRef(true); // data awal sudah dirender server; muat ulang hanya saat periode berubah
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [memulai, setMemulai] = useState(false);
  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [riwayat, setRiwayat] = useState<Versi[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bisaGenerate = role === "ADMIN" || role === "PIMPINAN";

  const muat = useCallback(async () => {
    if (!periodeId) return;
    const r = await getJson(`/api/rekap/${periodeId}`);
    if (!r.ok) return setError(r.body.pesan ?? "Gagal memuat rekap.");
    setError(null);
    setData(r.body);
  }, [periodeId]);

  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    muat();
  }, [muat]);

  // Polling selama ada rekap yang masih diantrekan / diproses.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (data?.sedangBerjalan) timer.current = setTimeout(muat, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, muat]);

  async function bukaRiwayat(userId: string) {
    if (terbuka === userId) return setTerbuka(null);
    setTerbuka(userId);
    setRiwayat(null);
    const r = await getJson(`/api/rekap/${periodeId}/versi?userId=${userId}`);
    if (!r.ok) return setError(r.body.pesan ?? "Gagal memuat riwayat versi.");
    setRiwayat(r.body.data);
  }

  async function kunci() {
    const p = periodes.find((x) => x.id === periodeId);
    if (!p || !confirm(`Kunci ${BULAN[p.bulan - 1]} ${p.tahun} dan buat rekap final? Seluruh data periode ini menjadi hanya-baca dan tidak dapat dibuka kembali.`)) return;
    setMemulai(true);
    const res = await fetch(`/api/periode/${periodeId}/kunci`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setMemulai(false);
    if (!res.ok) return setError(body.pesan ?? "Gagal mengunci periode.");
    setError(null);
    setInfo(body.rekapFinal.dimulai ? `Periode dikunci. Rekap final untuk ${body.rekapFinal.jumlah} pegawai sedang dibuat.` : `Periode dikunci. ${body.rekapFinal.alasan}`);
    setPeriodes((ps) => ps.map((x) => (x.id === periodeId ? { ...x, status: "DIKUNCI" } : x)));
    await muat();
  }

  async function generate() {
    setMemulai(true);
    setInfo(null);
    const res = await fetch("/api/rekap/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ periodeId }) });
    const body = await res.json().catch(() => ({}));
    setMemulai(false);
    if (!res.ok) return setError(body.pesan ?? "Gagal memulai pembuatan rekap.");
    setError(null);
    setInfo(`Pembuatan rekap untuk ${body.jumlah} pegawai dimulai.`);
    await muat();
  }

  const berjalan = data?.sedangBerjalan ?? false;
  const selesai = data?.data.filter((d) => d.rekap?.status === "SELESAI").length ?? 0;
  const total = data?.data.length ?? 0;

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <p className="eyebrow mb-1">Laporan SKP</p>
          <h1 className="hero-judul">Rekap Bulanan</h1>
          <p className="mt-1 text-sm text-ink-muted">Hanya catatan berstatus Disetujui yang dihitung sebagai capaian.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={periodeId} onChange={(e) => { setData(null); setPeriodeId(e.target.value); }} aria-label="Periode" className="field w-auto min-w-44 text-sm">
            {periodes.map((p) => (
              <option key={p.id} value={p.id}>
                {BULAN[p.bulan - 1]} {p.tahun} ({p.status})
              </option>
            ))}
          </select>
          {bisaGenerate && periodes.find((x) => x.id === periodeId)?.status !== "DIKUNCI" && (
            <button type="button" onClick={kunci} disabled={memulai || berjalan || !periodeId} className="btn border border-red-300 bg-surface text-red-800 hover:bg-red-50">
              Kunci periode &amp; rekap final
            </button>
          )}
          {bisaGenerate && (
            <button type="button" onClick={generate} disabled={memulai || berjalan || !periodeId} className="btn btn-primary">
              {memulai || berjalan ? "Sedang membuat rekap…" : "Generate rekap"}
            </button>
          )}
        </div>
      </header>

      {info && <Alert nada="sukses">{info}</Alert>}
      {error && <Alert nada="galat">{error}</Alert>}
      {data && total > 0 && (
        <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="text-sm text-ink-soft" aria-live="polite" data-progres>
            {selesai} dari {total} pegawai selesai{berjalan ? " — memperbarui otomatis…" : ""}
          </p>
          <div aria-hidden className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-track">
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-700" style={{ width: `${(selesai / total) * 100}%` }} />
          </div>
        </div>
      )}
      {!data && periodeId && (
        <div className="panel space-y-3 p-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-9 w-full" />)}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b text-xs">
              <tr>
                <th scope="col" className="px-3 py-2.5">Pegawai</th>
                <th scope="col" className="px-3 py-2.5">Versi</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">Diselesaikan</th>
                <th scope="col" className="px-3 py-2.5">Berkas</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => {
                const st = r.rekap ? STATUS[r.rekap.status] : null;
                return (
                  <Fragment key={r.userId}>
                  <tr className="border-b border-line last:border-0" data-pegawai={r.userId}>
                    <th scope="row" className="p-2 font-normal">
                      <div className="font-medium">{r.nama}</div>
                      <div className="text-xs text-ink-muted">{r.tim.join(", ")}</div>
                    </th>
                    <td className="p-2 tabular-nums">
                      {r.rekap ? `v${r.rekap.versi}${r.jumlahVersi > 1 ? ` (${r.jumlahVersi} versi)` : ""}` : "–"}
                      {r.rekap?.isFinal && <span className="ml-1.5 rounded-full bg-gold-100 px-2 py-0.5 text-[11px] font-semibold text-gold-700">Final</span>}
                    </td>
                    <td className="p-2">
                      {st ? (
                        <>
                          <span data-status={r.rekap!.status} className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${st.cls}`}>{st.label}</span>
                          {r.rekap!.errorMessage && <div className="mt-1 text-xs text-red-800">{r.rekap!.errorMessage}</div>}
                        </>
                      ) : (
                        <span className="text-xs text-ink-muted">Belum dibuat</span>
                      )}
                    </td>
                    <td className="p-2 text-xs">{r.rekap?.selesaiPada ? new Date(r.rekap.selesaiPada).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }) : "–"}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-1">
                        {r.rekap?.status === "SELESAI" && r.rekap.adaPdf && (
                          <a href={`/api/rekap/${r.rekap.id}/download?format=pdf`} aria-label={`Unduh PDF ${r.nama}`} className="flex min-h-11 items-center rounded border px-2 text-xs">PDF</a>
                        )}
                        {r.rekap?.status === "SELESAI" && r.rekap.adaXlsx && bisaGenerate && (
                          <a href={`/api/rekap/${r.rekap.id}/download?format=xlsx`} aria-label={`Unduh XLSX (semua pegawai) dari rekap ${r.nama}`} className="flex min-h-11 items-center rounded border px-2 text-xs">XLSX</a>
                        )}
                        {bisaGenerate && (
                          <a href={`/api/rekap/${periodeId}/bukti-zip?userId=${r.userId}`} aria-label={`Unduh ZIP bukti dukung ${r.nama}`} className="flex min-h-11 items-center rounded border px-2 text-xs">ZIP bukti</a>
                        )}
                        {r.rekap && (
                          <button type="button" onClick={() => bukaRiwayat(r.userId)} aria-expanded={terbuka === r.userId} aria-label={`Riwayat versi rekap ${r.nama}`} className="flex min-h-11 items-center rounded border px-2 text-xs">
                            Riwayat versi
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {terbuka === r.userId && (
                    <tr className="border-b border-line bg-surface-muted" data-riwayat={r.userId}>
                      <td colSpan={5} className="p-2">
                        {!riwayat ? (
                          <span className="text-xs text-ink-muted">Memuat riwayat…</span>
                        ) : (
                          <ul className="space-y-1 text-xs">
                            {riwayat.map((v) => (
                              <li key={v.id} className="flex flex-wrap items-center gap-2" data-versi={v.versi}>
                                <span className="tabular-nums font-medium">v{v.versi}</span>
                                {v.isFinal && <span className="rounded-full bg-gold-100 px-2 py-0.5 font-semibold text-gold-700">Final</span>}
                                <span>{STATUS[v.status].label}</span>
                                <span className="text-ink-muted">oleh {v.digeneratOleh}, {new Date(v.dibuatPada).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" })}</span>
                                {v.status === "SELESAI" && v.adaPdf && (
                                  <a href={`/api/rekap/${v.id}/download?format=pdf`} aria-label={`Unduh PDF ${r.nama} versi ${v.versi}`} className="flex min-h-11 items-center rounded border px-2">PDF v{v.versi}</a>
                                )}
                                {v.status === "SELESAI" && v.adaXlsx && bisaGenerate && (
                                  <a href={`/api/rekap/${v.id}/download?format=xlsx`} aria-label={`Unduh XLSX versi ${v.versi} dari rekap ${r.nama}`} className="flex min-h-11 items-center rounded border px-2">XLSX v{v.versi}</a>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState kecil judul="Tidak ada pegawai pada periode ini." keterangan="Anggota tim per periode diatur Admin di menu Tim." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
