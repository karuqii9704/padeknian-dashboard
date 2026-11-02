"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { angkaRingkas } from "@/lib/alokasi-format";
import type { DashboardLengkap } from "@/lib/dashboard-lengkap";
import { labelTanggal } from "@/lib/tanggal-id";
import { DaftarBukti, type BuktiView } from "../bukti/daftar-bukti";
import { IndikatorBukti } from "../bukti/indikator-bukti";
import { StatusBadge } from "../status-badge";
import { IkonKanan, IkonUnduh } from "../../ui/icons";
import { Alert, EmptyState, PageHeader } from "../../ui/primitives";
import { DonatStatus, HeatmapKepatuhan, KepatuhanTim, Legenda, TrenHarian } from "./grafik";

type Opsi = { periode: { id: string; tahun: number; bulan: number; status: string }[]; tim: { id: string; nama: string }[] };
type BarisPegawai = DashboardLengkap["tabel"]["data"][number];
type EntriRinci = {
  id: string;
  tanggal: string;
  isAdHoc: boolean;
  judulAdHoc: string | null;
  alokasi: { judul: string } | null;
  deskripsiCapaian: string;
  volume: string;
  satuan: string;
  kendala: string | null;
  statusVerifikasi: string;
  jumlahBukti: number;
  bukti: BuktiView[];
};
type Rincian = { pegawai: { id: string; nama: string; nip: string }; periode: { tahun: number; bulan: number }; data: EntriRinci[] };

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const STATUS_PERIODE: Record<string, string> = { AKTIF: "aktif", DRAFT: "draf", DIKUNCI: "dikunci" };
const AKSI_LABEL: Record<string, string> = { SETUJUI: "Disetujui", MINTA_REVISI: "Diminta revisi", TOLAK: "Ditolak" };
const desimal = (n: number) => String(n).replace(".", ",");

async function getJson(url: string) {
  const res = await fetch(url);
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

function Kartu({ id, label, nilai, ket, meter, aksen }: { id: string; label: string; nilai: string; ket?: string; meter?: number | null; aksen?: boolean }) {
  return (
    <div data-kpi={id} className={`panel relative flex flex-col justify-between overflow-hidden p-4 ${aksen ? "ring-1 ring-gold-300/60" : ""}`}>
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-[2rem] font-semibold leading-none tracking-tight tabular-nums text-brand-900" aria-label={`${label}: ${nilai}`}>
        {nilai}
      </p>
      {meter !== undefined && (
        <div aria-hidden className="mt-3 h-1 overflow-hidden rounded-full bg-track">
          <div className="h-full rounded-full bg-gold-400 transition-[width] duration-700" style={{ width: `${Math.min(100, meter ?? 0)}%` }} />
        </div>
      )}
      {ket && <p className="mt-1.5 text-xs text-ink-muted">{ket}</p>}
    </div>
  );
}

function Panel({ judul, ket, aksi, children, className = "" }: { judul: string; ket?: string; aksi?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const id = `h-${judul.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={`panel min-w-0 p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={id} className="text-[15px] font-semibold">{judul}</h2>
          {ket && <p className="mt-0.5 text-xs text-ink-muted">{ket}</p>}
        </div>
        {aksi}
      </div>
      {children}
    </section>
  );
}

export function DashboardClient({ role, opsi, awal }: { role: string; opsi: Opsi; awal: DashboardLengkap | null }) {
  const [data, setData] = useState<DashboardLengkap | null>(awal);
  const [periodeId, setPeriodeId] = useState(awal?.ringkasan.periode.id ?? "");
  const [timId, setTimId] = useState("");
  const [userId, setUserId] = useState("");
  const [opsiPegawai, setOpsiPegawai] = useState(() => (awal?.tabel.data ?? []).map((x) => ({ userId: x.userId, nama: x.nama })));
  const [memuat, setMemuat] = useState(false);
  const [error, setError] = useState<string | null>(awal ? null : "Belum ada periode aktif.");
  const [rinci, setRinci] = useState<Rincian | null>(null);
  const [rinciGalat, setRinciGalat] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [mengekspor, setMengekspor] = useState(false);
  const [infoEkspor, setInfoEkspor] = useState<string | null>(null);
  const pertama = useRef(true);

  const query = (denganPegawai: boolean) => {
    const q = new URLSearchParams();
    if (periodeId) q.set("periodeId", periodeId);
    if (timId) q.set("timId", timId);
    if (denganPegawai && userId) q.set("userId", userId);
    return q;
  };

  // Data awal sudah dirender server; muat ulang hanya saat filter berubah. Permintaan basi dibatalkan.
  useEffect(() => {
    if (pertama.current) {
      pertama.current = false;
      return;
    }
    const ac = new AbortController();
    setMemuat(true);
    fetch(`/api/dashboard?${query(true)}`, { signal: ac.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setData(null);
          return setError(body.pesan ?? "Gagal memuat dashboard.");
        }
        setError(null);
        setData(body);
        if (!userId) setOpsiPegawai(body.tabel.data.map((x: BarisPegawai) => ({ userId: x.userId, nama: x.nama })));
      })
      .catch(() => undefined)
      .finally(() => !ac.signal.aborted && setMemuat(false));
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query() hanya bergantung pada tiga filter ini
  }, [periodeId, timId, userId]);

  useEffect(() => {
    if (rinci || rinciGalat) dialog.current?.showModal();
    else dialog.current?.close();
  }, [rinci, rinciGalat]);

  async function bukaRincian(id: string) {
    setRinciGalat(null);
    const r = await getJson(`/api/dashboard/pegawai/${id}?${query(false)}`);
    if (!r.ok) return setRinciGalat(r.body.pesan ?? "Gagal memuat rincian.");
    setRinci(r.body);
  }

  async function ekspor() {
    setMengekspor(true);
    setInfoEkspor(null);
    const r = await getJson(`/api/dashboard/export?${query(true)}`);
    setMengekspor(false);
    if (!r.ok) return setError(r.body.pesan ?? "Gagal membuat ekspor.");
    setError(null);
    // Unduh lewat signed URL (umur singkat); tautan tidak disimpan.
    const a = document.createElement("a");
    a.href = r.body.url;
    a.download = r.body.namaFile;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setInfoEkspor(`Ekspor siap: ${r.body.namaFile} (${r.body.jumlahBaris} baris).`);
  }

  function tutupRincian() {
    setRinci(null);
    setRinciGalat(null);
  }

  const k = data?.ringkasan.kpi;
  const tabel = data?.tabel;
  const analitik = data?.analitik;
  const periode = data?.ringkasan.periode;
  const totalPegawaiHeatmap = analitik?.heatmap.length ?? 0;
  const belumMengisiHariIni = k ? Math.max(0, k.pegawaiAktif - k.pegawaiMengisiHariIni) : 0;

  return (
    <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Pemantauan kinerja"
        judul="Dashboard"
        keterangan={
          periode && (
            <>
              {BULAN[periode.bulan - 1]} {periode.tahun} · {data!.ringkasan.tim.map((t) => t.nama).join(", ") || "tanpa tim"}
            </>
          )
        }
        aksi={
          <button type="button" onClick={ekspor} disabled={mengekspor || !data} aria-busy={mengekspor} className="btn btn-primary">
            <IkonUnduh className="h-4 w-4" />
            {mengekspor ? "Menyiapkan ekspor…" : "Ekspor XLSX"}
          </button>
        }
      />

      <div className="panel grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-periode" className="text-xs font-medium text-ink-muted">Periode</label>
          <select value={periodeId} id="f-periode" onChange={(e) => { setPeriodeId(e.target.value); setUserId(""); }} className="field text-sm">
            {opsi.periode.map((p) => (
              <option key={p.id} value={p.id}>
                {BULAN[p.bulan - 1]} {p.tahun} ({STATUS_PERIODE[p.status] ?? p.status})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-tim" className="text-xs font-medium text-ink-muted">Tim kerja</label>
          <select value={timId} id="f-tim" onChange={(e) => { setTimId(e.target.value); setUserId(""); }} className="field text-sm">
            <option value="">{role === "KETUA_TIM" ? "Semua tim saya" : "Semua tim"}</option>
            {opsi.tim.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nama}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="f-pegawai" className="text-xs font-medium text-ink-muted">Pegawai</label>
          <select value={userId} id="f-pegawai" onChange={(e) => setUserId(e.target.value)} className="field text-sm">
            <option value="">Semua pegawai</option>
            {opsiPegawai.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.nama}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <Alert nada="galat">{error}</Alert>}
      {infoEkspor && <Alert nada="sukses">{infoEkspor}</Alert>}

      <div aria-busy={memuat} className={`space-y-5 transition-opacity duration-200 ${memuat ? "opacity-60" : ""}`}>
        {k && (
          <section aria-label="Ringkasan" className="muncul grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kartu id="pegawai-aktif" label="Pegawai aktif" nilai={String(k.pegawaiAktif)} ket={`${data!.ringkasan.tim.length} tim kerja`} />
            <Kartu id="alokasi" label="Alokasi periode ini" nilai={String(k.alokasiPeriodeIni)} />
            <Kartu
              id="entri-hari-ini"
              label="Entri terisi hari ini"
              nilai={String(k.entriTerisiHariIni)}
              ket={`${k.pegawaiMengisiHariIni} pegawai mengisi`}
              meter={k.pegawaiAktif ? (k.pegawaiMengisiHariIni / k.pegawaiAktif) * 100 : 0}
            />
            <Kartu id="menunggu" label="Menunggu verifikasi" nilai={String(k.entriMenungguVerifikasi)} aksen={k.entriMenungguVerifikasi > 0} />
            <Kartu
              id="bukti"
              label="Entri berbukti"
              nilai={k.persenEntriBerbukti === null ? "–" : `${desimal(k.persenEntriBerbukti)}%`}
              ket={k.totalEntri ? `${k.entriBerbukti} dari ${k.totalEntri} entri` : "Belum ada entri"}
              meter={k.persenEntriBerbukti}
            />
          </section>
        )}

        {analitik && periode && (
          <>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Panel judul="Tren pengisian harian" ket="Jumlah entri per hari kerja yang sudah berjalan, menurut status verifikasi." aksi={<Legenda />}>
                <TrenHarian tren={analitik.tren} totalPegawai={totalPegawaiHeatmap} />
              </Panel>
              <Panel judul="Status verifikasi" ket="Seluruh entri pada periode ini.">
                <DonatStatus status={analitik.status} />
                {k && belumMengisiHariIni > 0 && (
                  <p className="mt-4 rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-700">
                    <span className="font-semibold">{belumMengisiHariIni} pegawai</span> belum mengisi catatan hari ini.
                  </p>
                )}
                {role === "KETUA_TIM" && k && k.entriMenungguVerifikasi > 0 && (
                  <Link href="/verifikasi" className="btn btn-secondary mt-3 w-full">
                    Buka antrean verifikasi <IkonKanan className="h-4 w-4" />
                  </Link>
                )}
              </Panel>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Panel judul="Kepatuhan per tim" ket="Rata-rata hari kerja yang terisi oleh anggota aktif.">
                <KepatuhanTim tim={analitik.perTim} />
              </Panel>
              <Panel
                judul="Peta kepatuhan pengisian"
                ket="Setiap kotak satu hari kerja. Pegawai yang paling jarang mengisi tampil di atas; klik nama untuk membuka profil."
                aksi={<Legenda kosong />}
              >
                <HeatmapKepatuhan data={analitik} periodeId={periode.id} />
              </Panel>
            </div>
          </>
        )}

        {tabel && (
          <section aria-labelledby="h-pegawai" className="space-y-2">
            <div>
              <h2 id="h-pegawai" className="text-[15px] font-semibold">Ringkasan per pegawai</h2>
              <p className="text-xs text-ink-muted">
                Hari terisi dihitung terhadap {tabel.hariKerja.berlalu} hari kerja yang sudah berjalan (dari {tabel.hariKerja.periode} hari kerja periode ini).
              </p>
            </div>
            <div className="overflow-x-auto rounded border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b text-xs">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">Pegawai</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Entri</th>
                    <th scope="col" className="px-3 py-2.5">Volume</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Hari terisi</th>
                    <th scope="col" className="px-3 py-2.5 text-right">Belum diverifikasi</th>
                    <th scope="col" className="px-3 py-2.5">Verifikasi terakhir</th>
                    <th scope="col" className="px-3 py-2.5"><span className="sr-only">Profil</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tabel.data.map((r) => (
                    <tr key={r.userId} data-pegawai={r.userId}>
                      <th scope="row" className="px-3 py-2 font-normal">
                        <button type="button" onClick={() => bukaRincian(r.userId)} aria-label={`Lihat rincian ${r.nama}`} className="min-h-11 text-left font-medium text-brand-800 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-600">
                          {r.nama}
                        </button>
                        <div className="text-xs text-ink-muted">{r.tim.join(", ")}</div>
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">{r.jumlahEntri}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.volumePerSatuan.length === 0
                          ? "–"
                          : r.volumePerSatuan.map((v) => (
                              <div key={v.satuan}>
                                {desimal(v.total)} {v.satuan}
                                <span className="text-ink-muted"> ({desimal(v.disetujui)} disetujui)</span>
                              </div>
                            ))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.hariTerisi}/{tabel.hariKerja.berlalu}
                        <div className="text-xs text-ink-muted">{r.persenHariTerisi === null ? "–" : `${desimal(r.persenHariTerisi)}%`}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.entriMenunggu > 0 ? <span className="rounded-full bg-gold-50 px-2 py-0.5 font-medium text-gold-700">{r.entriMenunggu}</span> : r.entriMenunggu}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.verifikasiTerakhir ? (
                          <>
                            {AKSI_LABEL[r.verifikasiTerakhir.aksi]}
                            <div className="text-ink-muted">{new Date(r.verifikasiTerakhir.waktu).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })}</div>
                          </>
                        ) : (
                          <span className="text-ink-muted">Belum ada</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/dashboard/pegawai/${r.userId}?periodeId=${periodeId}`} className="btn btn-ghost min-h-9 px-2.5 text-xs">
                          Profil <IkonKanan className="h-3.5 w-3.5" />
                          <span className="sr-only"> {r.nama}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {tabel.data.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState kecil judul="Tidak ada pegawai pada cakupan ini." keterangan="Admin menambahkan anggota tim per periode di menu Tim." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <dialog ref={dialog} onClose={tutupRincian} aria-label="Rincian entri pegawai" className="m-auto max-h-[92vh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto p-0">
        {rinciGalat && (
          <div className="flex flex-col gap-3 p-5">
            <Alert nada="galat">{rinciGalat}</Alert>
            <button type="button" onClick={tutupRincian} className="btn btn-secondary">Tutup</button>
          </div>
        )}
        {rinci && (
          <div className="flex flex-col">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
              <div>
                <h2 className="text-lg font-semibold">{rinci.pegawai.nama}</h2>
                <p className="text-xs text-ink-muted">
                  {rinci.pegawai.nip} · {BULAN[rinci.periode.bulan - 1]} {rinci.periode.tahun} · {rinci.data.length} entri
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/dashboard/pegawai/${rinci.pegawai.id}?periodeId=${periodeId}`} className="btn btn-secondary max-sm:hidden">Profil lengkap</Link>
                <button type="button" onClick={tutupRincian} className="btn btn-secondary">Tutup</button>
              </div>
            </div>
            <ul className="space-y-2 p-5">
              {rinci.data.map((e) => (
                <li key={e.id} className="rounded border p-3.5" data-entri={e.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{e.alokasi?.judul ?? `${e.judulAdHoc} (tugas tambahan)`}</span>
                    <StatusBadge status={e.statusVerifikasi} />
                  </div>
                  <p className="text-xs text-ink-muted">{labelTanggal(e.tanggal)}</p>
                  <p className="mt-1 text-sm">{e.deskripsiCapaian}</p>
                  <p className="text-xs text-ink-soft">
                    {angkaRingkas(e.volume)} {e.satuan}
                    {e.kendala && <> · Kendala: {e.kendala}</>}
                  </p>
                  <div className="mt-1">
                    <IndikatorBukti jumlah={e.jumlahBukti} />
                    {e.bukti.length > 0 && <div className="mt-1"><DaftarBukti bukti={e.bukti} /></div>}
                  </div>
                </li>
              ))}
              {rinci.data.length === 0 && <li className="rounded border"><EmptyState kecil judul="Belum ada entri pada periode ini." /></li>}
            </ul>
          </div>
        )}
      </dialog>
    </main>
  );
}
