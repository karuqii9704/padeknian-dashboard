"use client";

import { useEffect, useRef, useState } from "react";
import { FORMAT_DITERIMA, formatUkuran, tipeTampilan } from "@/lib/bukti-klien";

export type BuktiView = { id: string; namaAsli: string; mimeType: string; ukuranBytes: number; tautan: string };

const EKS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

/** Pratinjau inline untuk gambar & PDF; dokumen lain berupa ikon + tombol unduh. */
type Props = {
  bukti: BuktiView[];
  /** Bila diisi, tiap bukti menampilkan tombol Hapus dan Ganti. */
  onHapus?: (b: BuktiView) => void;
  onGanti?: (b: BuktiView, file: File) => void;
  sibuk?: boolean;
};

export function DaftarBukti({ bukti, onHapus, onGanti, sibuk }: Props) {
  const [buka, setBuka] = useState<BuktiView | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (buka) dialog.current?.showModal();
    else dialog.current?.close();
  }, [buka]);

  if (bukti.length === 0) return <p className="text-sm text-gray-500">Belum ada bukti.</p>;

  return (
    <>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {bukti.map((b) => {
          const jenis = tipeTampilan(b.mimeType);
          return (
            <li key={b.id} className="flex items-center gap-3 rounded border p-2" data-jenis={jenis}>
              {jenis === "gambar" ? (
                <button type="button" onClick={() => setBuka(b)} aria-label={`Lihat ${b.namaAsli}`} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.tautan} alt={b.namaAsli} loading="lazy" className="h-14 w-14 rounded object-cover" />
                </button>
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-semibold">{EKS[b.mimeType] ?? "FILE"}</span>
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-medium">{b.namaAsli}</p>
                <p className="text-xs text-gray-600">{formatUkuran(b.ukuranBytes)}</p>
              </div>
              <div className="flex flex-col gap-1">
                {jenis === "dokumen" ? (
                  <a href={`${b.tautan}?unduh=1`} className="flex min-h-11 items-center justify-center rounded border px-3 text-sm">
                    Unduh
                  </a>
                ) : (
                  <button type="button" onClick={() => setBuka(b)} className="min-h-11 rounded border px-3 text-sm">
                    Lihat
                  </button>
                )}
                {onGanti && (
                  <label className={`flex min-h-11 cursor-pointer items-center justify-center rounded border px-3 text-sm ${sibuk ? "opacity-50" : ""}`}>
                    Ganti
                    <input
                      type="file"
                      aria-label={`Ganti ${b.namaAsli}`}
                      accept={FORMAT_DITERIMA}
                      disabled={sibuk}
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) onGanti(b, f);
                      }}
                    />
                  </label>
                )}
                {onHapus && (
                  <button type="button" disabled={sibuk} aria-label={`Hapus bukti ${b.namaAsli}`} onClick={() => onHapus(b)} className="min-h-11 rounded border px-3 text-sm text-red-800 disabled:opacity-50">
                    Hapus
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <dialog ref={dialog} onClose={() => setBuka(null)} aria-label="Pratinjau bukti" className="m-auto max-h-[94vh] w-[calc(100%-1rem)] max-w-3xl rounded p-3 backdrop:bg-black/60">
        {buka && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{buka.namaAsli}</p>
              <div className="flex gap-2">
                <a href={`${buka.tautan}?unduh=1`} className="flex min-h-11 items-center rounded border px-3 text-sm">
                  Unduh
                </a>
                <button type="button" onClick={() => setBuka(null)} className="min-h-11 rounded border px-3 text-sm">
                  Tutup
                </button>
              </div>
            </div>
            {tipeTampilan(buka.mimeType) === "gambar" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={buka.tautan} alt={buka.namaAsli} className="mx-auto max-h-[78vh] max-w-full object-contain" />
            ) : (
              <iframe src={buka.tautan} title={`Pratinjau ${buka.namaAsli}`} className="h-[78vh] w-full rounded border" />
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
