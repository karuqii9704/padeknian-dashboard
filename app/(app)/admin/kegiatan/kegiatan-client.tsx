"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "../../../ui/primitives";

type Kegiatan = { id: string; kode: string | null; uraian: string; satuanDefault: string | null; isActive: boolean };
const btn = "min-h-11 rounded border px-3 text-sm";
const field = "min-h-11 rounded border px-3";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

export function KegiatanClient({ awal }: { awal: Kegiatan[] }) {
  const [rows, setRows] = useState<Kegiatan[]>(awal);
  const pertama = useRef(true); // data awal dirender server
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Kegiatan | "baru" | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    const r = await api("/api/kegiatan");
    if (!r.ok) return setError(r.body.pesan ?? "Gagal memuat kegiatan.");
    setRows(r.body.data);
  }, []);
  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    load();
  }, [load]);
  useEffect(() => {
    if (editing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = { kode: f.get("kode"), uraian: f.get("uraian"), satuanDefault: f.get("satuanDefault") };
    const r =
      editing === "baru"
        ? await api("/api/kegiatan", { method: "POST", body: JSON.stringify(data) })
        : await api(`/api/kegiatan/${(editing as Kegiatan).id}`, { method: "PATCH", body: JSON.stringify(data) });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal menyimpan.");
    setError(null);
    setEditing(null);
    load();
  }
  async function toggle(k: Kegiatan) {
    const r = await api(`/api/kegiatan/${k.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !k.isActive }) });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal mengubah status.");
    setError(null);
    load();
  }

  const edit = editing && editing !== "baru" ? editing : null;
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Data induk"
        judul="Master Kegiatan"
        keterangan="Daftar kegiatan yang dapat dialokasikan ke pegawai."
        aksi={
          <button type="button" onClick={() => setEditing("baru")} className="btn btn-primary">
            + Tambah kegiatan
          </button>
        }
      />
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm">
        <thead className="border-b">
          <tr>
            <th className="px-4 py-3">Kode</th>
            <th className="px-4 py-3">Uraian</th>
            <th className="px-4 py-3">Satuan</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k.id} className={`border-b ${k.isActive ? "" : "text-gray-500"}`}>
              <td className="px-4 py-3 font-mono">{k.kode ?? "-"}</td>
              <td className="max-w-[22rem] px-4 py-3"><span className="break-words">{k.uraian}</span></td>
              <td className="px-4 py-3">{k.satuanDefault ?? "-"}</td>
              <td className="px-4 py-3">{k.isActive ? "Aktif" : "Nonaktif"}</td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(k)} className={btn}>Ubah</button>
                  <button type="button" onClick={() => toggle(k)} className={btn}>{k.isActive ? "Nonaktifkan" : "Aktifkan"}</button>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="p-4 text-center text-gray-500">Belum ada kegiatan.</td></tr>
          )}
        </tbody>
      </table></div>
      <dialog ref={dialog} aria-label="Form kegiatan" onClose={() => setEditing(null)} className="m-auto w-full max-w-md rounded p-5">
        {editing && (
          <form key={edit?.id ?? "baru"} onSubmit={submit} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{edit ? "Ubah kegiatan" : "Tambah kegiatan"}</h2>
            <label className="flex flex-col gap-1 text-sm">Kode (opsional, unik)
              <input name="kode" maxLength={40} defaultValue={edit?.kode ?? ""} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm">Uraian
              <textarea name="uraian" required defaultValue={edit?.uraian} rows={3} className="rounded border px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Satuan default (opsional)
              <input name="satuanDefault" maxLength={30} defaultValue={edit?.satuanDefault ?? ""} className={field} />
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
