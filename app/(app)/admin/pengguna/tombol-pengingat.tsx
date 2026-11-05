"use client";

import { useState } from "react";

type Hasil = { dikirim: true; tanggal: string; jumlah: number; sudahAda: number } | { dikirim: false; alasan: string };

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const label = (t: string) => `${Number(t.slice(8))} ${BULAN[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;

/** Kirim pengingat harian sekarang (biasanya otomatis 08.00 WIB). Aman diklik berulang: tidak ada notifikasi ganda. */
export function TombolPengingat() {
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ nada: "ok" | "info" | "galat"; teks: string } | null>(null);

  async function kirim() {
    setSibuk(true);
    setPesan(null);
    const res = await fetch("/api/pengingat", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as Hasil & { pesan?: string };
    setSibuk(false);
    if (!res.ok) return setPesan({ nada: "galat", teks: body.pesan ?? "Gagal mengirim pengingat." });
    if (!body.dikirim) return setPesan({ nada: "info", teks: body.alasan });
    setPesan({
      nada: "ok",
      teks:
        body.jumlah > 0
          ? `Pengingat terkirim ke ${body.jumlah} pegawai yang belum mencatat pekerjaan ${label(body.tanggal)}.`
          : `Tidak ada pengingat baru untuk ${label(body.tanggal)}${body.sudahAda ? ` (${body.sudahAda} pegawai sudah diingatkan sebelumnya)` : " — semua sudah mengisi"}.`,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
      <p className="min-w-0 flex-1 text-muted-foreground">
        Pengingat otomatis dikirim tiap hari kerja pukul 08.00 WIB ke pegawai yang belum mencatat pekerjaan pada hari kerja sebelumnya.
      </p>
      <button type="button" onClick={kirim} disabled={sibuk} aria-busy={sibuk} className="btn btn-secondary shrink-0">
        {sibuk ? "Mengirim…" : "Kirim pengingat sekarang"}
      </button>
      {pesan && (
        <p
          role={pesan.nada === "galat" ? "alert" : "status"}
          className={`w-full text-sm ${pesan.nada === "galat" ? "text-red-700 dark:text-red-300" : pesan.nada === "ok" ? "text-green-800 dark:text-green-300" : "text-muted-foreground"}`}
        >
          {pesan.teks}
        </p>
      )}
    </div>
  );
}
