"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LABEL_JENIS, type JenisEventNilai } from "@/lib/event-schema";
import { labelTanggal } from "@/lib/tanggal-id";
import { DaftarBukti, type BuktiView } from "../bukti/daftar-bukti";
import { Alert, EmptyState, PageHeader } from "../../ui/primitives";
import { EventForm, type EventAwal } from "./event-form";

type EventItem = {
  id: string;
  pelapor: { id: string; nama: string; nip: string };
  periodeDikunci: boolean;
  judul: string;
  jenis: JenisEventNilai;
  tanggalMulai: string;
  tanggalSelesai: string;
  lokasi: string;
  peran: string;
  uraianHasil: string;
  lampiran: BuktiView[];
};
type Daftar = { data: EventItem[]; total: number; page: number; pageSize: number };
type Tab = "saya" | "tim";

const rentang = (e: EventItem) =>
  e.tanggalMulai === e.tanggalSelesai ? labelTanggal(e.tanggalMulai) : `${labelTanggal(e.tanggalMulai)} – ${labelTanggal(e.tanggalSelesai)}`;

export function EventClient({ awal, hariIni, ketua, bukaForm }: { awal: Daftar; hariIni: string; ketua: boolean; bukaForm: boolean }) {
  const [tab, setTab] = useState<Tab>("saya");
  const [daftar, setDaftar] = useState<Record<Tab, Daftar | null>>({ saya: awal, tim: null });
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "baru" } | { mode: "ubah"; awal: EventAwal } | null>(bukaForm ? { mode: "baru" } : null);
  const dialog = useRef<HTMLDialogElement>(null);

  const muat = useCallback(
    async (t: Tab, page = 1) => {
      setMemuat(true);
      const res = await fetch(`/api/event?cakupan=${t}&page=${page}&pageSize=${awal.pageSize}`);
      const body = await res.json().catch(() => ({}));
      setMemuat(false);
      if (!res.ok) return setError(body.pesan ?? "Gagal memuat event.");
      setError(null);
      setDaftar((prev) => ({ ...prev, [t]: page === 1 ? body : { ...body, data: [...(prev[t]?.data ?? []), ...body.data] } }));
    },
    [awal.pageSize],
  );

  useEffect(() => {
    if (form) dialog.current?.showModal();
    else dialog.current?.close();
  }, [form]);

  useEffect(() => {
    if (tab === "tim" && !daftar.tim) void muat("tim");
  }, [tab, daftar.tim, muat]);

  async function hapus(e: EventItem) {
    if (!confirm(`Hapus event "${e.judul}" beserta lampirannya?`)) return;
    const res = await fetch(`/api/event/${e.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.pesan ?? "Gagal menghapus event.");
    setInfo("Event dihapus.");
    void muat(tab);
  }

  const aktif = daftar[tab];
  const bisaUbah = tab === "saya";

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Pekerjaan saya"
        judul="Event"
        keterangan="Laporkan rapat, pelatihan, survei lapangan, dan kegiatan lainnya beserta dokumentasinya."
        aksi={
          <button onClick={() => setForm({ mode: "baru" })} className="btn btn-primary">
            + Lapor event
          </button>
        }
      />

      {ketua && (
        <div role="tablist" aria-label="Cakupan event" className="flex gap-2">
          {(["saya", "tim"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setInfo(null);
              }}
              className={`btn ${tab === t ? "btn-primary" : "btn-secondary"}`}
            >
              {t === "saya" ? "Event saya" : "Event tim"}
            </button>
          ))}
        </div>
      )}
      {tab === "tim" && <p className="text-sm text-ink-muted">Event anggota tim Anda, hanya untuk dibaca.</p>}

      {error && <Alert nada="galat">{error}</Alert>}
      {info && <Alert nada="sukses">{info}</Alert>}

      <ul className="space-y-3" aria-busy={memuat}>
        {aktif?.data.map((e) => (
          <li key={e.id} className="panel p-4" data-event={e.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="min-w-0 text-base font-medium leading-snug">{e.judul}</h2>
              <span className="chip shrink-0">{LABEL_JENIS[e.jenis]}</span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {rentang(e)} · {e.lokasi} · {e.peran}
              {tab === "tim" && <> · Pelapor: <b className="font-medium text-ink-soft">{e.pelapor.nama}</b></>}
            </p>
            <p className="mt-2 whitespace-pre-line text-sm">{e.uraianHasil}</p>
            {e.lampiran.length > 0 && (
              <div className="mt-3">
                <DaftarBukti bukti={e.lampiran} />
              </div>
            )}
            {bisaUbah && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {e.periodeDikunci ? (
                  <p className="text-xs text-ink-muted">Periode sudah dikunci; event tidak dapat diubah.</p>
                ) : (
                  <>
                    <button
                      onClick={() =>
                        setForm({
                          mode: "ubah",
                          awal: { id: e.id, judul: e.judul, jenis: e.jenis, tanggalMulai: e.tanggalMulai, tanggalSelesai: e.tanggalSelesai, lokasi: e.lokasi, peran: e.peran, uraianHasil: e.uraianHasil, lampiran: e.lampiran },
                        })
                      }
                      className="btn btn-secondary"
                    >
                      Ubah
                    </button>
                    <button onClick={() => hapus(e)} className="btn btn-ghost text-red-700 hover:!bg-red-50 hover:!text-red-800">
                      Hapus
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
        {aktif && aktif.data.length === 0 && (
          <li className="panel">
            <EmptyState
              kecil
              judul={tab === "saya" ? "Belum ada event." : "Belum ada event dari anggota tim."}
              keterangan={tab === "saya" ? "Tekan + Lapor event untuk mencatat rapat, pelatihan, atau kegiatan lapangan." : "Pastikan anggota sudah ditambahkan ke tim Anda pada periode berjalan."}
            />
          </li>
        )}
        {!aktif && memuat && <li className="panel p-4 text-sm text-ink-muted">Memuat…</li>}
      </ul>

      {aktif && aktif.data.length < aktif.total && (
        <div className="flex justify-center">
          <button onClick={() => muat(tab, aktif.page + 1)} disabled={memuat} className="btn btn-secondary">
            {memuat ? "Memuat…" : "Muat lagi"}
          </button>
        </div>
      )}

      <dialog ref={dialog} onClose={() => setForm(null)} className="m-auto max-h-[92vh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto p-5">
        {form && (
          <EventForm
            key={form.mode === "ubah" ? form.awal.id : "baru"}
            awal={form.mode === "ubah" ? form.awal : undefined}
            hariIni={hariIni}
            onSaved={() => {
              setForm(null);
              setInfo("Event tersimpan.");
              setTab("saya");
              void muat("saya");
            }}
            onCancel={() => setForm(null)}
          />
        )}
      </dialog>
    </main>
  );
}
