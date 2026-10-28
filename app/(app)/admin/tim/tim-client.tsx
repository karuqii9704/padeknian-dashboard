"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Tim = { id: string; nama: string; tahun: number; isActive: boolean; ketua: { id: string; nama: string; nip: string } };
type Periode = { id: string; tahun: number; bulan: number; status: "DRAFT" | "AKTIF" | "DIKUNCI" };
type Anggota = { userId: string; nama: string; nip: string; peranDalamTim: "KETUA" | "ANGGOTA" };
type User = { id: string; nama: string; nip: string; role: string };

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const btn = "min-h-11 rounded border px-3 text-sm";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

export function TimClient({ awal }: { awal: { tims: Tim[]; ketuaOpsi: User[]; pegawai: User[]; periodes: Periode[] } }) {
  const [tims, setTims] = useState<Tim[]>(awal.tims);
  const [ketuaOpsi] = useState<User[]>(awal.ketuaOpsi);
  const [pegawai] = useState<User[]>(awal.pegawai);
  const [periodes] = useState<Periode[]>(awal.periodes);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Tim | "baru" | null>(null);
  const [panel, setPanel] = useState<Tim | null>(null);
  const [periodeId, setPeriodeId] = useState((awal.periodes.find((x) => x.status === "AKTIF") ?? awal.periodes[0])?.id ?? "");
  const [anggota, setAnggota] = useState<Anggota[]>([]);
  const [pilih, setPilih] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);

  const loadTims = useCallback(async () => {
    const r = await api("/api/tim");
    if (!r.ok) return setError(r.body.pesan ?? "Gagal memuat tim.");
    setTims(r.body.data);
  }, []);

  const loadAnggota = useCallback(async () => {
    if (!panel || !periodeId) return setAnggota([]);
    const r = await api(`/api/tim/${panel.id}/anggota?periodeId=${periodeId}`);
    if (!r.ok) return setError(r.body.pesan ?? "Gagal memuat anggota.");
    setError(null);
    setAnggota(r.body.anggota);
  }, [panel, periodeId]);

  useEffect(() => {
    loadAnggota();
  }, [loadAnggota]);

  useEffect(() => {
    if (editing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);

  async function submitTim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = { nama: f.get("nama"), tahun: Number(f.get("tahun")), ketuaId: f.get("ketuaId") };
    const r =
      editing === "baru"
        ? await api("/api/tim", { method: "POST", body: JSON.stringify(data) })
        : await api(`/api/tim/${(editing as Tim).id}`, { method: "PATCH", body: JSON.stringify(data) });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal menyimpan tim.");
    setError(null);
    setEditing(null);
    loadTims();
  }

  async function ubahAnggota(body: { tambah?: string[]; hapus?: string[] }) {
    if (!panel) return;
    const r = await api(`/api/tim/${panel.id}/anggota`, { method: "POST", body: JSON.stringify({ periodeId, ...body }) });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal mengubah anggota.");
    setError(null);
    setPilih("");
    loadAnggota();
  }

  const edit = editing && editing !== "baru" ? editing : null;
  const sudah = new Set(anggota.map((a) => a.userId));

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="hero-judul">Tim Kerja</h1>
        <button onClick={() => setEditing("baru")} className="min-h-11 rounded bg-blue-700 px-4 text-white">+ Tambah tim</button>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">{error}</p>}

      <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm">
        <thead className="border-b"><tr><th className="p-2">Nama tim</th><th className="p-2">Tahun</th><th className="p-2">Ketua</th><th className="p-2">Status</th><th className="p-2">Aksi</th></tr></thead>
        <tbody>
          {tims.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="p-2">{t.nama}</td><td className="p-2">{t.tahun}</td><td className="p-2">{t.ketua.nama}</td>
              <td className="p-2">{t.isActive ? "Aktif" : "Nonaktif"}</td>
              <td className="flex gap-2 p-2">
                <button onClick={() => setEditing(t)} className={btn}>Ubah</button>
                <button onClick={() => setPanel(t)} className={btn}>Anggota</button>
              </td>
            </tr>
          ))}
          {tims.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-500">Belum ada tim kerja.</td></tr>}
        </tbody>
      </table></div>

      {panel && (
        <section className="rounded border p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Anggota: {panel.nama}</h2>
            <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} className="min-h-11 rounded border px-2" aria-label="Periode">
              {periodes.map((p) => <option key={p.id} value={p.id}>{BULAN[p.bulan - 1]} {p.tahun} ({p.status})</option>)}
            </select>
            <button onClick={() => setPanel(null)} className={`${btn} ml-auto`}>Tutup</button>
          </div>
          <ul className="mb-3 divide-y text-sm">
            {anggota.map((a) => (
              <li key={a.userId} className="flex items-center justify-between py-2">
                <span>{a.nama} <span className="text-gray-500">({a.nip})</span> {a.peranDalamTim === "KETUA" && <b>· Ketua</b>}</span>
                {a.peranDalamTim !== "KETUA" && <button onClick={() => ubahAnggota({ hapus: [a.userId] })} className={btn}>Hapus</button>}
              </li>
            ))}
            {anggota.length === 0 && <li className="py-2 text-gray-500">Belum ada anggota pada periode ini.</li>}
          </ul>
          <div className="flex gap-2">
            <select value={pilih} onChange={(e) => setPilih(e.target.value)} className="min-h-11 flex-1 rounded border px-2" aria-label="Tambah anggota">
              <option value="">Pilih pegawai…</option>
              {pegawai.filter((u) => !sudah.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.nama} ({u.nip})</option>)}
            </select>
            <button disabled={!pilih || !periodeId} onClick={() => ubahAnggota({ tambah: [pilih] })} className="min-h-11 rounded bg-blue-700 px-4 text-white disabled:opacity-50">Tambah</button>
          </div>
        </section>
      )}

      <dialog ref={dialog} onClose={() => setEditing(null)} className="m-auto w-full max-w-md rounded p-5">
        {editing && (
          <form key={edit?.id ?? "baru"} onSubmit={submitTim} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{edit ? "Ubah tim" : "Tambah tim"}</h2>
            <label className="flex flex-col gap-1 text-sm">Nama tim
              <input name="nama" required defaultValue={edit?.nama} className="min-h-11 rounded border px-3" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Tahun
              <input name="tahun" type="number" required defaultValue={edit?.tahun ?? new Date().getFullYear()} className="min-h-11 rounded border px-3" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Ketua tim
              <select name="ketuaId" required defaultValue={edit?.ketua.id ?? ""} className="min-h-11 rounded border px-2">
                <option value="" disabled>Pilih ketua…</option>
                {ketuaOpsi.map((u) => <option key={u.id} value={u.id}>{u.nama} ({u.nip})</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={btn}>Batal</button>
              <button className="min-h-11 rounded bg-blue-700 px-4 text-white">Simpan</button>
            </div>
          </form>
        )}
      </dialog>
    </main>
  );
}
