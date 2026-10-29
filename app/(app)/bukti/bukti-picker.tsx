"use client";

import { FORMAT_DITERIMA, formatUkuran } from "@/lib/bukti-klien";
import { ProgressBar } from "../alokasi/progress-bar";
import { IkonCentang } from "../../ui/icons";
import type { AntreanBukti } from "./use-antrean-bukti";

const tombol = "flex min-h-11 cursor-pointer items-center justify-center rounded border px-3 text-sm";

type Props = {
  antrean: AntreanBukti;
  disabled?: boolean;
  /** Dipanggil untuk mengulang unggah item yang gagal (entri sudah tersimpan). */
  onCobaLagi?: () => void;
  judul?: string;
  /** Nama objek induk pada petunjuk batas file, mis. "event". */
  objek?: string;
};

export function BuktiPicker({ antrean, disabled, onCobaLagi, judul = "Bukti dukung (opsional, disarankan)", objek = "catatan" }: Props) {
  const { items, galat, tambah, hapus, sisaKuota } = antrean;
  const nonaktif = disabled || sisaKuota === 0;

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium text-ink-soft">{judul}</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className={`${tombol} ${nonaktif ? "opacity-50" : ""}`}>
          Ambil foto
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={nonaktif}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) void tambah(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <label className={`${tombol} ${nonaktif ? "opacity-50" : ""}`}>
          Pilih file
          <input
            type="file"
            accept={FORMAT_DITERIMA}
            multiple
            disabled={nonaktif}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) void tambah(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-xs text-gray-600">JPG, PNG, PDF, DOCX, atau XLSX. Maksimal 10 MB per file, 10 file per {objek}.</p>
      {galat && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-xs text-red-800">
          {galat}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-3 rounded border p-2" data-status={i.status}>
            {i.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={i.previewUrl} alt={`Pratinjau ${i.file.name}`} className="h-14 w-14 shrink-0 rounded object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-medium uppercase">
                {i.file.name.split(".").pop()}
              </span>
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium">{i.file.name}</p>
              <p className="text-xs text-gray-600">{formatUkuran(i.file.size)}</p>
              {i.status === "mengunggah" && (
                <>
                  <p className="text-xs">Mengunggah…</p>
                  <ProgressBar persen={i.progress} label={`Progres unggah ${i.file.name}`} />
                </>
              )}
              {i.status === "selesai" && <p className="inline-flex items-center gap-1 text-xs text-brand-700"><IkonCentang className="h-3.5 w-3.5" /> Terunggah</p>}
              {i.status === "gagal" && <p className="text-xs text-red-700">Gagal: {i.pesan}</p>}
            </div>
            <div className="flex flex-col gap-1">
              {i.status === "gagal" && onCobaLagi && (
                <button type="button" onClick={onCobaLagi} className="min-h-11 rounded border px-2 text-xs">
                  Coba lagi
                </button>
              )}
              {(i.status === "siap" || i.status === "gagal") && (
                <button type="button" onClick={() => hapus(i.key)} aria-label={`Buang ${i.file.name}`} className="min-h-11 rounded border px-2 text-xs">
                  Buang
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
