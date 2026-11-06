"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DaftarAnggota, type AnggotaBaris } from "./daftar-anggota";

export type TimRingkas = { id: string; nama: string; ketua: { id: string; nama: string } };
export type PeriodeRingkas = { id: string; tahun: number; bulan: number; status: "DRAFT" | "AKTIF" | "DIKUNCI" };
export type CalonAnggota = { id: string; nama: string; nip: string; role: string };

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const STATUS: Record<PeriodeRingkas["status"], string> = { DRAFT: "draf", AKTIF: "aktif", DIKUNCI: "dikunci" };
const btn = "min-h-11 rounded border px-3 text-sm";

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

/**
 * Kelola anggota satu tim per periode. Dipakai Admin (semua tim, pilih periode sendiri) dan Ketua Tim
 * di "Tim Saya" (periode ditetapkan halaman lewat `periodeIdTetap`).
 */
export function PanelAnggota({
  tim,
  periodes,
  calon,
  onTutup,
  periodeIdTetap,
  penggunaId,
  judul,
}: {
  tim: TimRingkas;
  periodes: PeriodeRingkas[];
  calon: CalonAnggota[];
  onTutup?: () => void;
  periodeIdTetap?: string;
  penggunaId?: string;
  judul?: React.ReactNode;
}) {
  const [periodePilihan, setPeriodeId] = useState((periodes.find((x) => x.status === "AKTIF") ?? periodes[0])?.id ?? "");
  const periodeId = periodeIdTetap ?? periodePilihan;
  // Anggota disimpan bersama periodenya: berganti periode = "memuat" sampai data periode itu tiba.
  const [muatan, setMuatan] = useState<{ periodeId: string; anggota: AnggotaBaris[] } | null>(null);
  const memuat = !!periodeId && muatan?.periodeId !== periodeId;
  const anggota = useMemo(() => (muatan?.periodeId === periodeId ? muatan.anggota : []), [muatan, periodeId]);
  const [pilih, setPilih] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const periode = periodes.find((p) => p.id === periodeId);
  const dikunci = periode?.status === "DIKUNCI";

  const muat = useCallback(() => {
    if (!periodeId) return;
    const pid = periodeId;
    void api(`/api/tim/${tim.id}/anggota?periodeId=${pid}`).then((r) => {
      if (!r.ok) {
        setError(r.body.pesan ?? "Gagal memuat anggota.");
        setMuatan({ periodeId: pid, anggota: [] });
        return;
      }
      setError(null);
      setMuatan({ periodeId: pid, anggota: r.body.anggota });
    });
  }, [tim.id, periodeId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function ubah(body: { tambah?: string[]; hapus?: string[] }, pesan: string) {
    const r = await api(`/api/tim/${tim.id}/anggota`, { method: "POST", body: JSON.stringify({ periodeId, ...body }) });
    if (!r.ok) {
      setInfo(null);
      return setError(r.body.pesan ?? "Gagal mengubah anggota.");
    }
    setError(null);
    setInfo(pesan);
    setPilih("");
    muat();
  }

  const sudah = useMemo(() => new Set(anggota.map((a) => a.userId)), [anggota]);
  const opsi = calon.filter((u) => !sudah.has(u.id) && u.id !== tim.ketua.id);

  return (
    <section className="rounded border p-4" aria-label={`Anggota ${tim.nama}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {judul ?? <h2 className="font-semibold">Anggota: {tim.nama}</h2>}
        {!periodeIdTetap && (
          <select value={periodeId} onChange={(e) => { setPeriodeId(e.target.value); setInfo(null); }} className="min-h-11 rounded border px-2" aria-label="Periode">
            {periodes.map((p) => <option key={p.id} value={p.id}>{BULAN[p.bulan - 1]} {p.tahun} ({STATUS[p.status]})</option>)}
          </select>
        )}
        {onTutup && <button type="button" onClick={onTutup} className={`${btn} ml-auto`}>Tutup</button>}
      </div>
      {error && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900 dark:border-red-900 dark:bg-[#1a0505] dark:text-red-200">{error}</p>}
      {info && <p role="status" className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-900 dark:border-green-900 dark:bg-[#04140a] dark:text-green-200">{info}</p>}
      {dikunci && <p className="mb-3 text-sm text-ink-muted">Periode ini sudah dikunci; keanggotaan hanya dapat dilihat.</p>}
      <div className="mb-3" aria-busy={memuat}>
        <DaftarAnggota
          anggota={anggota}
          penggunaId={penggunaId}
          kosong={memuat ? "Memuat anggota…" : undefined}
          aksi={(a) =>
            a.peranDalamTim !== "KETUA" && !dikunci ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Keluarkan ${a.nama} dari ${tim.nama} untuk periode ini? Catatan yang sudah ada tetap tersimpan.`)) {
                    ubah({ hapus: [a.userId] }, `${a.nama} dikeluarkan dari tim.`);
                  }
                }}
                className={`${btn} bg-surface`}
                aria-label={`Hapus ${a.nama} dari anggota tim`}
              >
                Hapus
              </button>
            ) : null
          }
        />
      </div>
      {!dikunci && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="sr-only">Pilih pegawai untuk ditambahkan sebagai anggota</span>
            <select value={pilih} onChange={(e) => setPilih(e.target.value)} className="min-h-11 w-full rounded border px-2" aria-label="Tambah anggota">
              <option value="">Pilih pegawai…</option>
              {opsi.map((u) => <option key={u.id} value={u.id}>{u.nama} ({u.nip})</option>)}
            </select>
          </label>
          <button
            type="button"
            disabled={!pilih || !periodeId}
            onClick={() => ubah({ tambah: [pilih] }, `${calon.find((u) => u.id === pilih)?.nama ?? "Pegawai"} ditambahkan ke tim.`)}
            className="btn btn-primary shrink-0 disabled:opacity-50"
          >
            Tambah
          </button>
        </div>
      )}
    </section>
  );
}
