"use client";

import { useState } from "react";
import { DaftarBukti, type BuktiView } from "./daftar-bukti";
import { IkonCentang, IkonPeringatan } from "../../ui/icons";

/** Penanda kelengkapan bukti: ikon + label (tidak mengandalkan warna saja). */
export function IndikatorBukti({ jumlah }: { jumlah: number }) {
  return jumlah > 0 ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700" data-bukti="ada">
      <IkonCentang className="h-3.5 w-3.5" /> Ada bukti{jumlah > 1 ? ` (${jumlah})` : ""}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800" data-bukti="belum">
      <IkonPeringatan className="h-3.5 w-3.5" /> Belum ada bukti
    </span>
  );
}

/** Indikator + tombol untuk membuka daftar bukti entri (dimuat saat dibuka). */
export function BuktiEntri({ entriId, jumlah }: { entriId: string; jumlah: number }) {
  const [terbuka, setTerbuka] = useState(false);
  const [bukti, setBukti] = useState<BuktiView[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  async function toggle() {
    if (terbuka) return setTerbuka(false);
    setTerbuka(true);
    const res = await fetch(`/api/pekerjaan-harian/${entriId}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setGalat(body.pesan ?? "Gagal memuat bukti.");
    setGalat(null);
    setBukti(body.entri.bukti);
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <IndikatorBukti jumlah={jumlah} />
        {jumlah > 0 && (
          <button type="button" onClick={toggle} aria-expanded={terbuka} className="btn btn-ghost min-h-9 px-2.5 text-xs text-brand-700 underline decoration-brand-200 underline-offset-4">
            {terbuka ? "Sembunyikan bukti" : "Lihat bukti"}
          </button>
        )}
      </div>
      {terbuka && (
        <div className="mt-2">
          {galat ? <p className="text-xs text-red-700">{galat}</p> : bukti ? <DaftarBukti bukti={bukti} /> : <div className="skeleton h-14 w-full max-w-xs" aria-label="Memuat…" />}
        </div>
      )}
    </div>
  );
}
