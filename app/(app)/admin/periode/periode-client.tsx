"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "../../../ui/primitives";

type Periode = { id: string; tahun: number; bulan: number; jumlahHariKerja: number; status: "DRAFT" | "AKTIF" | "DIKUNCI" };
type Libur = { id: string; tanggal: string; keterangan: string; jenis: string };

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const JENIS: Record<string, string> = { LIBUR_NASIONAL: "Libur nasional", CUTI_BERSAMA: "Cuti bersama", LIBUR_LAIN: "Libur lain" };
const btn = "min-h-11 rounded border px-3 text-sm";
const input = "min-h-11 rounded border px-3";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

export function PeriodeClient({ awal }: { awal: { periodes: Periode[]; libur: Libur[]; tahun: number } }) {
  const now = new Date();
  const [periodes, setPeriodes] = useState<Periode[]>(awal.periodes);
  const [libur, setLibur] = useState<Libur[]>(awal.libur.map((l) => ({ ...l, tanggal: l.tanggal.slice(0, 10) })));
  const [tahunLibur, setTahunLibur] = useState(awal.tahun);
  const pertama = useRef(true); // data awal dirender server
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadPeriode = useCallback(async () => {
    const r = await api("/api/periode");
    if (!r.ok) return setError(r.body.pesan ?? "Gagal memuat periode.");
    setPeriodes(r.body.data);
  }, []);
  const loadLibur = useCallback(async () => {
    const r = await api(`/api/hari-libur?tahun=${tahunLibur}`);
    if (!r.ok) return setError(r.body.pesan ?? "Gagal memuat hari libur.");
    setLibur(r.body.data.map((l: Libur) => ({ ...l, tanggal: l.tanggal.slice(0, 10) })));
  }, [tahunLibur]);

  useEffect(() => {
    if (pertama.current) return;
    loadPeriode();
  }, [loadPeriode]);
  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    loadLibur();
  }, [loadLibur]);

  async function tambahPeriode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api("/api/periode", { method: "POST", body: JSON.stringify({ tahun: Number(f.get("tahun")), bulan: Number(f.get("bulan")) }) });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal membuat periode.");
    setError(null);
    loadPeriode();
  }
  async function aktifkan(p: Periode) {
    if (!confirm(`Aktifkan ${BULAN[p.bulan - 1]} ${p.tahun}? Periode aktif saat ini akan diturunkan ke Draft.`)) return;
    const r = await api(`/api/periode/${p.id}/aktifkan`, { method: "POST" });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal mengaktifkan periode.");
    setError(null);
    loadPeriode();
  }
  async function kunci(p: Periode) {
    const nama = `${BULAN[p.bulan - 1]} ${p.tahun}`;
    if (!confirm(`Kunci ${nama}? Seluruh catatan, bukti, dan alokasi periode ini menjadi hanya-baca dan rekap final dibuat otomatis. Tindakan ini tidak dapat dibatalkan.`)) return;
    const r = await api(`/api/periode/${p.id}/kunci`, { method: "POST" });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal mengunci periode.");
    setError(null);
    setInfo(
      r.body.rekapFinal.dimulai
        ? `${nama} dikunci. Rekap final untuk ${r.body.rekapFinal.jumlah} pegawai sedang dibuat.`
        : `${nama} dikunci. Rekap final belum dibuat: ${r.body.rekapFinal.alasan}`,
    );
    loadPeriode();
  }
  async function tambahLibur(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await api("/api/hari-libur", { method: "POST", body: JSON.stringify({ tanggal: f.get("tanggal"), keterangan: f.get("keterangan"), jenis: f.get("jenis") }) });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal menambah hari libur.");
    setError(null);
    form.reset();
    loadLibur();
    loadPeriode();
  }
  async function hapusLibur(l: Libur) {
    if (!confirm(`Hapus hari libur "${l.keterangan}" (${l.tanggal})?`)) return;
    const r = await api(`/api/hari-libur/${l.id}`, { method: "DELETE" });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal menghapus hari libur.");
    setError(null);
    loadLibur();
    loadPeriode();
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <section>
        <div className="mb-5">
          <PageHeader eyebrow="Data induk" judul="Periode Bulanan" keterangan="Buat, aktifkan, dan kunci periode kerja bulanan beserta hari liburnya." />
        </div>
        {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">{error}</p>}
        {info && <p role="status" className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-900">{info}</p>}
        <form onSubmit={tambahPeriode} className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">Bulan
            <select name="bulan" defaultValue={now.getMonth() + 1} className={input}>{BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm">Tahun
            <input name="tahun" type="number" defaultValue={now.getFullYear()} required className={`${input} w-28`} />
          </label>
          <button className="btn btn-primary">+ Buat periode</button>
        </form>
        <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm">
          <thead className="border-b"><tr><th className="px-4 py-3">Periode</th><th className="px-4 py-3">Hari kerja</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Aksi</th></tr></thead>
          <tbody>
            {periodes.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="px-4 py-3">{BULAN[p.bulan - 1]} {p.tahun}</td>
                <td className="px-4 py-3">{p.jumlahHariKerja}</td>
                <td className="px-4 py-3">{p.status}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {p.status === "DRAFT" && <button type="button" onClick={() => aktifkan(p)} className={btn}>Aktifkan</button>}
                    {p.status !== "DIKUNCI" && <button type="button" onClick={() => kunci(p)} aria-label={`Kunci ${BULAN[p.bulan - 1]} ${p.tahun}`} className={btn}>Kunci</button>}
                  </div>
                </td>
              </tr>
            ))}
            {periodes.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-ink-muted">Belum ada periode.</td></tr>}
          </tbody>
        </table></div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-lg font-semibold">Hari Libur</h2>
          <input type="number" value={tahunLibur} onChange={(e) => setTahunLibur(Number(e.target.value))} className={`${input} w-28`} aria-label="Tahun" />
        </div>
        <form onSubmit={tambahLibur} className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">Tanggal<input name="tanggal" type="date" required className={input} /></label>
          <label className="flex flex-1 flex-col gap-1 text-sm">Keterangan<input name="keterangan" required maxLength={160} className={input} /></label>
          <label className="flex flex-col gap-1 text-sm">Jenis
            <select name="jenis" className={input}>{Object.entries(JENIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <button className="btn btn-primary">+ Tambah</button>
        </form>
        <ul className="divide-y text-sm">
          {libur.map((l) => (
            <li key={l.id} className="flex items-center justify-between py-2">
              <span><b>{l.tanggal}</b> · {l.keterangan} <span className="text-ink-muted">({JENIS[l.jenis]})</span></span>
              <button type="button" onClick={() => hapusLibur(l)} className={btn}>Hapus</button>
            </li>
          ))}
          {libur.length === 0 && <li className="py-2 text-ink-muted">Belum ada hari libur pada tahun ini.</li>}
        </ul>
      </section>
    </main>
  );
}
