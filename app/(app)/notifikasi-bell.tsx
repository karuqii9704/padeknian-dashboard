"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IkonLonceng } from "../ui/icons";

type Notif = { id: string; tipe: string; judul: string; isi: string; link: string | null; isRead: boolean; createdAt: string };

const POLL_MS = 60_000;

function waktuRelatif(iso: string, sekarang = Date.now()) {
  const menit = Math.max(0, Math.floor((sekarang - new Date(iso).getTime()) / 60000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

/** Ikon lonceng + jumlah belum dibaca + daftar notifikasi terbaru (FR-42). */
export function NotifikasiBell() {
  const router = useRouter();
  const [belumDibaca, setBelumDibaca] = useState(0);
  const [daftar, setDaftar] = useState<Notif[]>([]);
  const [buka, setBuka] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const wadah = useRef<HTMLDivElement>(null);

  const muat = useCallback(async () => {
    try {
      const res = await fetch("/api/notifikasi?pageSize=10");
      if (!res.ok) return;
      const body = await res.json();
      setBelumDibaca(body.belumDibaca);
      setDaftar(body.data);
      setGalat(null);
    } catch {
      setGalat("Gagal memuat notifikasi.");
    }
  }, []);

  useEffect(() => {
    muat();
    const t = setInterval(muat, POLL_MS);
    const onFokus = () => muat();
    window.addEventListener("focus", onFokus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFokus);
    };
  }, [muat]);

  // Tutup dengan klik di luar atau tombol Escape.
  useEffect(() => {
    if (!buka) return;
    const klik = (e: MouseEvent) => {
      if (wadah.current && !wadah.current.contains(e.target as Node)) setBuka(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBuka(false);
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", esc);
    };
  }, [buka]);

  async function bukaNotif(n: Notif) {
    if (!n.isRead) {
      setDaftar((d) => d.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setBelumDibaca((c) => Math.max(0, c - 1));
      await fetch(`/api/notifikasi/${n.id}/baca`, { method: "POST" }).catch(() => undefined);
    }
    setBuka(false);
    if (n.link) router.push(n.link);
  }

  async function tandaiSemua() {
    await fetch("/api/notifikasi/baca-semua", { method: "POST" });
    setDaftar((d) => d.map((x) => ({ ...x, isRead: true })));
    setBelumDibaca(0);
  }

  return (
    <div ref={wadah} className="relative">
      <button
        type="button"
        onClick={() => {
          setBuka((b) => !b);
          if (!buka) muat();
        }}
        aria-label={belumDibaca > 0 ? `Notifikasi, ${belumDibaca} belum dibaca` : "Notifikasi, tidak ada yang baru"}
        aria-expanded={buka}
        aria-haspopup="true"
        className={`tool relative ${buka ? "!bg-white/25" : ""}`}
      >
        <IkonLonceng />
        {belumDibaca > 0 && (
          <span data-testid="jumlah-notifikasi" className="absolute -right-0.5 -top-0.5 min-w-[1.15rem] rounded-full bg-gold-400 px-1 text-center text-[10px] font-semibold leading-[1.15rem] text-brand-950 ring-2 ring-solid">
            {belumDibaca > 99 ? "99+" : belumDibaca}
          </span>
        )}
      </button>

      {buka && (
        <section
          role="region"
          aria-label="Daftar notifikasi"
          className="fixed inset-x-2 top-16 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-solid text-ink shadow-[0_24px_48px_-12px_rgb(8_47_33/0.25)] animate-masuk sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2 backdrop-blur">
            <h2 className="text-sm font-semibold">Notifikasi</h2>
            <button type="button" onClick={tandaiSemua} disabled={belumDibaca === 0} className="min-h-11 px-2 text-xs text-blue-800 underline disabled:text-gray-400 disabled:no-underline">
              Tandai semua dibaca
            </button>
          </div>
          {galat && <p role="alert" className="px-3 py-2 text-xs text-red-700">{galat}</p>}
          <ul>
            {daftar.map((n) => (
              <li key={n.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => bukaNotif(n)}
                  data-baca={n.isRead ? "ya" : "belum"}
                  className={`relative flex min-h-11 w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted ${n.isRead ? "" : "bg-brand-50/70"}`}
                >
                  {!n.isRead && <span aria-hidden className="absolute left-1.5 top-4 size-1.5 rounded-full bg-gold-500" />}
                  <span className={n.isRead ? "" : "font-semibold"}>{n.judul}</span>
                  <span className="text-xs text-ink-soft">{n.isi}</span>
                  <span className="text-[11px] text-ink-muted">{waktuRelatif(n.createdAt)}</span>
                </button>
              </li>
            ))}
            {daftar.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-muted">Belum ada notifikasi.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
