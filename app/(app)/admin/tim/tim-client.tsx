"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "../../../ui/primitives";
import { PanelAnggota } from "./panel-anggota";

type Tim = { id: string; nama: string; tahun: number; isActive: boolean; ketua: { id: string; nama: string; nip: string } };
type Periode = { id: string; tahun: number; bulan: number; status: "DRAFT" | "AKTIF" | "DIKUNCI" };
type User = { id: string; nama: string; nip: string; role: string };

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
  const dialog = useRef<HTMLDialogElement>(null);

  const loadTims = useCallback(async () => {
    const r = await api("/api/tim");
    if (!r.ok) return setError(r.body.pesan ?? "Gagal memuat tim.");
    setTims(r.body.data);
  }, []);

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

  const edit = editing && editing !== "baru" ? editing : null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Data induk"
        judul="Tim Kerja"
        keterangan="Tim kerja per tahun beserta ketua dan anggotanya."
        aksi={<button type="button" onClick={() => setEditing("baru")} className="btn btn-primary">+ Tambah tim</button>}
      />
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">{error}</p>}

      <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm">
        <thead className="border-b"><tr><th className="px-4 py-3">Nama tim</th><th className="px-4 py-3">Tahun</th><th className="px-4 py-3">Ketua</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Aksi</th></tr></thead>
        <tbody>
          {tims.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="max-w-[18rem] px-4 py-3"><span className="break-words">{t.nama}</span></td><td className="px-4 py-3">{t.tahun}</td><td className="max-w-[16rem] px-4 py-3"><span className="break-words">{t.ketua.nama}</span></td>
              <td className="px-4 py-3">{t.isActive ? "Aktif" : "Nonaktif"}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(t)} className={btn}>Ubah</button>
                  <button type="button" onClick={() => setPanel(t)} className={btn}>Anggota</button>
                </div>
              </td>
            </tr>
          ))}
          {tims.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-ink-muted">Belum ada tim kerja.</td></tr>}
        </tbody>
      </table></div>

      {panel && <PanelAnggota key={panel.id} tim={panel} periodes={periodes} calon={pegawai} onTutup={() => setPanel(null)} />}

      <dialog ref={dialog} aria-label="Form tim kerja" onClose={() => setEditing(null)} className="m-auto w-full max-w-md rounded p-5">
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
              <button className="btn btn-primary">Simpan</button>
            </div>
          </form>
        )}
      </dialog>
    </main>
  );
}
