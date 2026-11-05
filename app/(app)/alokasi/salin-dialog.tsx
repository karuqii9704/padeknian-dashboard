"use client";

import { useEffect, useRef, useState } from "react";
import { angkaRingkas } from "@/lib/alokasi-format";
import { AlokasiForm, type Anggota, type Draft, type KegiatanOpsi } from "./alokasi-form";

type Hasil = {
  asal: { tahun: number; bulan: number };
  tujuan: { tahun: number; bulan: number };
  draft: (Draft & { sumberAlokasiId: string })[];
};

type Props = {
  open: boolean;
  timId: string;
  periodeTujuanId: string;
  rentang: { mulai: string; selesai: string };
  anggota: Anggota[];
  kegiatan: KegiatanOpsi[];
  onClose: () => void;
  onDone: (jumlahTersimpan: number) => void;
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function SalinDialog({ open, timId, periodeTujuanId, rentang, anggota, kegiatan, onClose, onDone }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(open);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [antrean, setAntrean] = useState<Hasil["draft"]>([]);
  const [idx, setIdx] = useState(0);
  const [tersimpan, setTersimpan] = useState(0);

  useEffect(() => {
    if (!open) {
      dialog.current?.close();
      return;
    }
    // Komponen dipasang ulang setiap kali dibuka (lihat alokasi-client), jadi state awal sudah bersih.
    dialog.current?.showModal();
    (async () => {
      const res = await fetch("/api/alokasi/salin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timId, periodeTujuanId }),
      });
      const body = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) return setError(body.pesan ?? "Gagal mengambil alokasi periode sebelumnya.");
      setHasil(body);
      setDipilih(new Set(body.draft.map((d: { sumberAlokasiId: string }) => d.sumberAlokasiId)));
    })();
  }, [open, timId, periodeTujuanId]);

  function selesaiAntrean(jumlah: number) {
    onDone(jumlah);
  }
  function lanjut(simpan: boolean) {
    const total = simpan ? tersimpan + 1 : tersimpan;
    setTersimpan(total);
    if (idx + 1 >= antrean.length) selesaiAntrean(total);
    else setIdx(idx + 1);
  }

  const tinjau = antrean.length > 0;
  const current = tinjau ? antrean[idx] : null;

  return (
    <dialog ref={dialog} aria-label="Salin dari periode sebelumnya" onClose={onClose} className="m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded p-5 backdrop:bg-black/40">
      {open && !tinjau && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Salin dari periode sebelumnya</h2>
          {loading && <p className="text-sm text-ink-soft">Memuat…</p>}
          {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          {hasil && (
            <>
              <p className="text-sm text-ink-soft">
                Dari {BULAN[hasil.asal.bulan - 1]} {hasil.asal.tahun} ke {BULAN[hasil.tujuan.bulan - 1]} {hasil.tujuan.tahun}. Capaian dan bukti tidak ikut disalin.
              </p>
              {hasil.draft.length === 0 && <p className="rounded border p-4 text-center text-sm text-ink-muted">Tidak ada alokasi aktif di periode sebelumnya.</p>}
              <ul className="divide-y">
                {hasil.draft.map((d) => (
                  <li key={d.sumberAlokasiId}>
                    <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5"
                        checked={dipilih.has(d.sumberAlokasiId)}
                        onChange={(e) => {
                          const n = new Set(dipilih);
                          if (e.target.checked) n.add(d.sumberAlokasiId);
                          else n.delete(d.sumberAlokasiId);
                          setDipilih(n);
                        }}
                      />
                      <span>
                        <b>{d.judul}</b>
                        <span className="block text-xs text-ink-soft">
                          {d.penugasan.map((p) => `${p.nama} ${angkaRingkas(p.targetVolume)} ${d.satuan}`).join("; ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded border px-3 text-sm">Batal</button>
            <button type="button"
              disabled={!hasil || dipilih.size === 0}
              onClick={() => hasil && setAntrean(hasil.draft.filter((d) => dipilih.has(d.sumberAlokasiId)))}
              className="btn btn-primary disabled:opacity-50"
            >
              Tinjau {dipilih.size > 0 ? `${dipilih.size} alokasi` : ""}
            </button>
          </div>
        </div>
      )}
      {open && current && (
        <AlokasiForm
          key={current.sumberAlokasiId}
          awal={current}
          judulForm={`Tinjau alokasi ${idx + 1} dari ${antrean.length}`}
          timId={timId}
          periodeId={periodeTujuanId}
          rentang={rentang}
          anggota={anggota}
          kegiatan={kegiatan}
          onSaved={() => lanjut(true)}
          onSkip={() => lanjut(false)}
          onCancel={onClose}
        />
      )}
    </dialog>
  );
}
