"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { angkaRingkas } from "@/lib/alokasi-format";
import { labelTanggal } from "@/lib/tanggal-id";
import { BuktiEntri } from "../bukti/indikator-bukti";
import { CatatanVerifikasi } from "../catatan-verifikasi";
import { StatusBadge } from "../status-badge";
import { EntriForm, type AlokasiOpsi, type EntriAwal } from "../hari-ini/entri-form";
import { Alert, EmptyState, PageHeader } from "../../ui/primitives";

type Entri = {
  id: string;
  tanggal: string;
  isAdHoc: boolean;
  judulAdHoc: string | null;
  alokasi: { id: string; judul: string } | null;
  deskripsiCapaian: string;
  volume: string;
  satuan: string;
  status: "BELUM_MULAI" | "PROSES" | "SELESAI";
  kendala: string | null;
  statusVerifikasi: string;
  jumlahBukti: number;
  periodeDikunci: boolean;
  verifikasiTerakhir: { aksi: string; catatan: string | null; verifikator: string; createdAt: string } | null;
};
type Konteks = { hariIni: string; tanggalBolehDicatat: string[]; alokasi: AlokasiOpsi[] };

async function getJson(url: string) {
  const res = await fetch(url);
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

export function RevisiClient({ userId, awal: data0 }: { userId: string; awal: { rows: Entri[]; konteks: Konteks } }) {
  const router = useRouter();
  const [rows, setRows] = useState<Entri[] | null>(data0.rows);
  const [konteks, setKonteks] = useState<Konteks | null>(data0.konteks);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [awal, setAwal] = useState<EntriAwal | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    // Ketua tim juga dapat melihat entri anggota di endpoint ini; halaman ini hanya untuk entri milik sendiri.
    const [e, k] = await Promise.all([
      getJson(`/api/pekerjaan-harian?perluTindakan=true&userId=${userId}&pageSize=200`),
      getJson("/api/hari-ini"),
    ]);
    if (!e.ok) return setError(e.body.pesan ?? "Gagal memuat entri.");
    setError(null);
    setRows(e.body.data);
    if (k.ok) setKonteks({ hariIni: k.body.hariIni, tanggalBolehDicatat: k.body.tanggalBolehDicatat, alokasi: k.body.alokasi });
  }, [userId]);

  useEffect(() => {
    if (awal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [awal]);

  if (!rows || !konteks) return <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6"><Alert nada="galat">{error ?? "Gagal memuat entri."}</Alert></main>;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Pekerjaan saya"
        judul="Perlu Revisi"
        keterangan="Perbaiki catatan di bawah ini. Setelah disimpan, catatan kembali ke antrean verifikasi."
      />
      {error && <Alert nada="galat">{error}</Alert>}
      {info && <Alert nada="sukses">{info}</Alert>}
      <ul className="space-y-3">
        {rows.map((e) => (
          <li key={e.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">{e.alokasi?.judul ?? e.judulAdHoc}</h2>
              <StatusBadge status={e.statusVerifikasi} />
            </div>
            <p className="text-xs text-ink-muted">{labelTanggal(e.tanggal)}</p>
            <p className="mt-1 text-sm">{e.deskripsiCapaian}</p>
            <p className="text-xs text-ink-muted">{angkaRingkas(e.volume)} {e.satuan}</p>
            <CatatanVerifikasi terakhir={e.verifikasiTerakhir} statusVerifikasi={e.statusVerifikasi} />
            <BuktiEntri entriId={e.id} jumlah={e.jumlahBukti} />
            {e.periodeDikunci ? (
              <p className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">Periode dikunci — catatan tidak dapat diperbaiki lagi.</p>
            ) : (
            <button type="button"
              onClick={() =>
                setAwal({
                  id: e.id,
                  isAdHoc: e.isAdHoc,
                  judulAdHoc: e.judulAdHoc,
                  alokasiJudul: e.alokasi?.judul ?? null,
                  tanggal: e.tanggal,
                  deskripsiCapaian: e.deskripsiCapaian,
                  volume: e.volume,
                  satuan: e.satuan,
                  status: e.status,
                  kendala: e.kendala,
                })
              }
              className="btn btn-primary mt-3"
            >
              Perbaiki
            </button>
            )}
          </li>
        ))}
        {rows.length === 0 && (
          <li className="panel">
            <EmptyState judul="Tidak ada catatan yang perlu direvisi." keterangan="Catatan yang diminta revisi atau ditolak ketua tim akan muncul di sini." />
          </li>
        )}
      </ul>

      <dialog ref={dialog} aria-label="Detail revisi" onClose={() => setAwal(null)} className="m-auto max-h-[92vh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto p-5">
        {awal && (
          <EntriForm
            key={awal.id}
            mode="ubah"
            alokasi={konteks.alokasi}
            tanggalOpsi={konteks.tanggalBolehDicatat}
            hariIni={konteks.hariIni}
            awal={awal}
            onSaved={() => {
              setAwal(null);
              setInfo("Perbaikan tersimpan. Catatan menunggu verifikasi ulang.");
              load();
              router.refresh(); // perbarui badge Revisi pada navigasi
            }}
            onCancel={() => setAwal(null)}
          />
        )}
      </dialog>
    </main>
  );
}
