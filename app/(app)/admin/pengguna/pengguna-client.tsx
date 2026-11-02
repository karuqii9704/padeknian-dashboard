"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalitikPegawai } from "@/lib/pegawai-insight";
import { Alert } from "../../../ui/primitives";
import { InformasiPegawai } from "./informasi-pegawai";

type Role = "PEGAWAI" | "KETUA_TIM" | "PIMPINAN" | "ADMIN";
type Pengguna = {
  id: string;
  nip: string;
  nama: string;
  email: string | null;
  role: Role;
  jabatan: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

const ROLES: Role[] = ["PEGAWAI", "KETUA_TIM", "PIMPINAN", "ADMIN"];
const ROLE_LABEL: Record<Role, string> = {
  PEGAWAI: "Pegawai",
  KETUA_TIM: "Ketua Tim",
  PIMPINAN: "Pimpinan",
  ADMIN: "Admin",
};
const PAGE_SIZE = 20;

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

export function PenggunaClient({
  meId,
  awal,
  analitik,
}: {
  meId: string;
  awal: { rows: Pengguna[]; total: number };
  analitik: AnalitikPegawai;
}) {
  const [rows, setRows] = useState<Pengguna[]>(awal.rows);
  const [total, setTotal] = useState(awal.total);
  const pertama = useRef(true); // data awal dirender server
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [aktif, setAktif] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Pengguna | "baru" | null>(null);
  const [secret, setSecret] = useState<{ nama: string; password: string } | null>(null);
  const formDialog = useRef<HTMLDialogElement>(null);
  const secretDialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q) p.set("q", q);
    if (role) p.set("role", role);
    if (aktif) p.set("aktif", aktif);
    const { ok, body } = await api(`/api/pengguna?${p}`);
    if (!ok) return setError(body.pesan ?? "Gagal memuat pengguna.");
    setError(null);
    setRows(body.data);
    setTotal(body.total);
  }, [page, q, role, aktif]);

  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    load();
  }, [load]);

  useEffect(() => {
    if (editing) formDialog.current?.showModal();
    else formDialog.current?.close();
  }, [editing]);
  useEffect(() => {
    if (secret) secretDialog.current?.showModal();
    else secretDialog.current?.close();
  }, [secret]);

  async function submitForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {
      nama: f.get("nama"),
      email: f.get("email"),
      jabatan: f.get("jabatan"),
      role: f.get("role"),
    };
    let r;
    if (editing === "baru") {
      r = await api("/api/pengguna", { method: "POST", body: JSON.stringify({ ...data, nip: f.get("nip") }) });
      if (r.ok) setSecret({ nama: r.body.user.nama, password: r.body.passwordSementara });
    } else if (editing) {
      r = await api(`/api/pengguna/${editing.id}`, { method: "PATCH", body: JSON.stringify(data) });
    }
    if (r && !r.ok) return setError(r.body.pesan ?? "Gagal menyimpan.");
    setError(null);
    setEditing(null);
    load();
  }

  async function toggleAktif(u: Pengguna) {
    const aksi = u.isActive ? "menonaktifkan" : "mengaktifkan";
    if (!confirm(`Yakin ${aksi} akun ${u.nama}?`)) return;
    const r = await api(`/api/pengguna/${u.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !u.isActive }) });
    if (!r.ok) setError(r.body.pesan ?? "Gagal mengubah status akun.");
    else load();
  }

  async function reset(u: Pengguna) {
    if (!confirm(`Reset password ${u.nama}? Password lama langsung tidak berlaku.`)) return;
    const r = await api(`/api/pengguna/${u.id}/reset-password`, { method: "POST" });
    if (!r.ok) return setError(r.body.pesan ?? "Gagal reset password.");
    setSecret({ nama: u.nama, password: r.body.passwordSementara });
    load();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const edit = editing && editing !== "baru" ? editing : null;
  const btn = "min-h-11 rounded border px-3 text-sm";

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <InformasiPegawai data={analitik} />

      <section aria-labelledby="h-kelola-akun" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="h-kelola-akun" className="text-[15px] font-semibold">Kelola akun</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Tambah, ubah, nonaktifkan, atau reset password pegawai ({total} akun).
            </p>
          </div>
          <button type="button" onClick={() => setEditing("baru")} className="btn btn-primary">
            + Tambah pengguna
          </button>
        </div>

        <details className="panel group overflow-hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium marker:content-none">
            <span>Daftar akun ({rows.length} ditampilkan)</span>
            <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>

          <div className="border-t px-4 py-3">
            <div className="mb-3 flex flex-wrap gap-2">
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                <span className="sr-only">Cari nama, NIP, atau email</span>
                <input
                  type="search"
                  placeholder="Cari nama, NIP, atau email"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  className="field"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="sr-only">Filter peran</span>
                <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="field min-w-[9rem]" aria-label="Filter peran">
                  <option value="">Semua peran</option>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="sr-only">Filter status</span>
                <select value={aktif} onChange={(e) => { setAktif(e.target.value); setPage(1); }} className="field min-w-[9rem]" aria-label="Filter status">
                  <option value="">Semua status</option>
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </label>
            </div>

            {error && <Alert nada="galat">{error}</Alert>}

      <div className="overflow-x-auto">
        <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm">
          <thead className="border-b">
            <tr><th className="px-4 py-3">NIP</th><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Peran</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Aksi</th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="px-4 py-3 font-mono whitespace-nowrap">{u.nip}</td>
                <td className="max-w-[18rem] px-4 py-3"><span className="break-words">{u.nama}</span><div className="break-all text-xs text-ink-muted">{u.email ?? "-"}</div></td>
                <td className="px-4 py-3">{ROLE_LABEL[u.role]}</td>
                <td className="px-4 py-3">
                  {u.isActive ? "Aktif" : "Nonaktif"}
                  {u.mustChangePassword && <div className="text-xs text-amber-700">Wajib ganti password</div>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setEditing(u)} className={btn}>Ubah</button>
                    <button type="button" onClick={() => reset(u)} className={btn}>Reset password</button>
                    {u.id !== meId && (
                      <button type="button" onClick={() => toggleAktif(u)} className={btn}>{u.isActive ? "Nonaktifkan" : "Aktifkan"}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-ink-muted">Tidak ada pengguna.</td></tr>}
          </tbody>
        </table></div>
      </div>

      <nav className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={btn}>Sebelumnya</button>
        <span className="text-muted-foreground">Halaman {page} dari {pages} ({total} pengguna)</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className={btn}>Berikutnya</button>
      </nav>
          </div>
        </details>
      </section>

      <dialog ref={formDialog} aria-label="Form pengguna" onClose={() => setEditing(null)} className="m-auto w-full max-w-md rounded p-5">
        {editing && (
          <form key={edit?.id ?? "baru"} onSubmit={submitForm} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{edit ? "Ubah pengguna" : "Tambah pengguna"}</h2>
            {!edit && (
              <label className="flex flex-col gap-1 text-sm">NIP (8-18 digit)
                <input name="nip" required pattern="\d{8,18}" className="min-h-11 rounded border px-3" />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">Nama
              <input name="nama" required defaultValue={edit?.nama} className="min-h-11 rounded border px-3" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Email (opsional)
              <input name="email" type="email" defaultValue={edit?.email ?? ""} className="min-h-11 rounded border px-3" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Jabatan (opsional)
              <input name="jabatan" defaultValue={edit?.jabatan ?? ""} className="min-h-11 rounded border px-3" />
            </label>
            <label className="flex flex-col gap-1 text-sm">Peran
              <select name="role" defaultValue={edit?.role ?? "PEGAWAI"} disabled={edit?.id === meId} className="min-h-11 rounded border px-2">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            {!edit && <p className="text-xs text-ink-soft">Password sementara dibuat otomatis dan wajib diganti saat login pertama.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={btn}>Batal</button>
              <button className="btn btn-primary">Simpan</button>
            </div>
          </form>
        )}
      </dialog>

      <dialog ref={secretDialog} aria-label="Password sementara" onClose={() => setSecret(null)} className="m-auto w-full max-w-md rounded p-5">
        {secret && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Password sementara</h2>
            <p className="text-sm">Untuk <b>{secret.nama}</b>. Hanya ditampilkan sekali; sampaikan lewat kanal aman.</p>
            <code className="select-all rounded bg-track px-3 py-2 text-center text-lg">{secret.password}</code>
            <button type="button" onClick={() => setSecret(null)} className="btn btn-primary">Tutup</button>
          </div>
        )}
      </dialog>
    </main>
  );
}