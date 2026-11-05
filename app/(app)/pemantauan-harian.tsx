"use client";

import { useEffect, useState } from "react";
import { ACUAN_BAIK, ACUAN_CUKUP, type HariKepatuhan } from "@/lib/kepatuhan-harian";

/*
 * Pemantauan harian: satu grafik, beberapa metrik yang dapat dipilih, tampil sebagai batang
 * atau garis. Setiap metrik menjawab satu pertanyaan dan memakai satu skala (persen 0–100%
 * atau jumlah). Hari kerja tanpa data tetap punya kolom sendiri agar celahnya terlihat.
 */

type MetrikId = "kepatuhan" | "catatan" | "disetujui" | "bukti";
type Jenis = "batang" | "garis";
type Metrik = {
  label: string;
  tanya: string;
  catatan?: string;
  persen: boolean;
  /** Warnai menurut ambang 80% / 50% dan tampilkan garis acuan. */
  ambang: boolean;
  nilai: (h: HariKepatuhan) => number | null;
  rinci: (h: HariKepatuhan) => string;
};

const persenDari = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

const METRIK: Record<MetrikId, Metrik> = {
  kepatuhan: {
    label: "Kepatuhan pengisian",
    tanya: "Berapa persen pegawai yang mencatat minimal satu pekerjaan pada tiap hari kerja?",
    persen: true,
    ambang: true,
    nilai: (h) => h.persen,
    rinci: (h) => `${h.pengisi} dari ${h.wajib} pegawai mengisi`,
  },
  catatan: {
    label: "Catatan masuk",
    tanya: "Berapa banyak catatan pekerjaan yang dicatat pada tiap hari kerja?",
    persen: false,
    ambang: false,
    nilai: (h) => h.catatan,
    rinci: (h) => `${h.catatan} catatan dari ${h.pengisi} pegawai`,
  },
  disetujui: {
    label: "Sudah disetujui",
    tanya: "Dari catatan tiap hari, berapa persen yang sudah disetujui ketua tim?",
    catatan: "Hari-hari terbaru wajar lebih rendah karena catatannya masih antre verifikasi.",
    persen: true,
    ambang: false,
    nilai: (h) => persenDari(h.disetujui, h.catatan),
    rinci: (h) => `${h.disetujui} dari ${h.catatan} catatan disetujui`,
  },
  bukti: {
    label: "Berbukti dukung",
    tanya: "Dari catatan tiap hari, berapa persen yang dilampiri bukti dukung?",
    persen: true,
    ambang: false,
    nilai: (h) => persenDari(h.berbukti, h.catatan),
    rinci: (h) => `${h.berbukti} dari ${h.catatan} catatan berbukti`,
  },
};
const URUTAN_METRIK = Object.keys(METRIK) as MetrikId[];

const NAMA_HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const namaHari = (iso: string) => NAMA_HARI[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const labelHari = (iso: string) => `${namaHari(iso)}, ${Number(iso.slice(8))} ${BULAN_PENDEK[Number(iso.slice(5, 7)) - 1]}`;
const desimal = (n: number) => String(n).replace(".", ",");

/** Batas atas skala jumlah yang "bulat" (1, 2, 2,5, 5 × 10^k). */
function maksRapi(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const nadaKelas = (p: number) => (p >= ACUAN_BAIK ? "bg-brand-500" : p >= ACUAN_CUKUP ? "bg-gold-500" : "bg-red-500");

const KUNCI_SIMPAN_BAWAAN = "padeknian.pemantauan-harian";

function Statistik({ label, nilai, ket }: { label: string; nilai: string; ket?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-2.5 py-2 sm:px-3">
      <p className="text-xs leading-snug text-muted-foreground">{label}</p>
      <p className="text-base font-semibold leading-tight tabular-nums text-foreground sm:text-lg">{nilai}</p>
      {ket && <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">{ket}</p>}
    </div>
  );
}

/** `cakupan`: keterangan siapa yang dihitung sebagai pegawai wajib lapor (berbeda di beranda Admin dan Dashboard). */
export function PemantauanHarian({
  hari,
  cakupan = "Pegawai & Ketua Tim aktif",
  kunciSimpan = KUNCI_SIMPAN_BAWAAN,
}: {
  hari: HariKepatuhan[];
  cakupan?: string;
  /** Kunci localStorage pilihan metrik/jenis (berbeda per halaman). */
  kunciSimpan?: string;
}) {
  const [metrikId, setMetrikId] = useState<MetrikId>("kepatuhan");
  const [jenis, setJenis] = useState<Jenis>("batang");

  // Pilihan terakhir diingat per perangkat (kenyamanan saja; aman bila penyimpanan diblokir).
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(kunciSimpan) ?? "null") as { metrik?: string; jenis?: string } | null;
      if (v?.metrik && v.metrik in METRIK) setMetrikId(v.metrik as MetrikId);
      if (v?.jenis === "batang" || v?.jenis === "garis") setJenis(v.jenis);
    } catch {
      /* abaikan */
    }
  }, [kunciSimpan]);
  function simpan(m: MetrikId, j: Jenis) {
    setMetrikId(m);
    setJenis(j);
    try {
      localStorage.setItem(kunciSimpan, JSON.stringify({ metrik: m, jenis: j }));
    } catch {
      /* abaikan */
    }
  }

  if (hari.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada hari kerja yang berjalan pada periode ini.</p>;
  }
  if (hari[0].wajib === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada pegawai aktif yang wajib mengisi catatan.</p>;
  }

  const m = METRIK[metrikId];
  const nilai = hari.map((h) => m.nilai(h));
  const ada = nilai.filter((v): v is number => v !== null);
  const maks = m.persen ? 100 : maksRapi(Math.max(0, ...ada));
  const tinggi = (v: number) => Math.min(100, (v / maks) * 100);
  const fmt = (v: number | null) => (v === null ? "–" : m.persen ? `${desimal(v)}%` : v.toLocaleString("id-ID"));
  const warna = (v: number) => (m.ambang ? nadaKelas(v) : "bg-brand-500");

  const rata = ada.length ? Math.round((ada.reduce((a, v) => a + v, 0) / ada.length) * 10) / 10 : null;
  const iTerakhir = hari.length - 1;
  let iTerendah = -1;
  nilai.forEach((v, i) => {
    if (v !== null && (iTerendah < 0 || v < (nilai[iTerendah] as number))) iTerendah = i;
  });
  const diBawah = ada.filter((v) => v < ACUAN_BAIK).length;

  const skala = m.persen ? [100, 50, 0] : [maks, maks / 2, 0];
  const n = hari.length;
  const rapat = n > 12;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  // Garis: dipotong pada hari tanpa nilai agar tidak menyambung data yang tidak ada.
  const segmen: { i: number; v: number }[][] = [];
  nilai.forEach((v, i) => {
    if (v === null) return void segmen.push([]);
    if (segmen.length === 0) segmen.push([]);
    segmen[segmen.length - 1].push({ i, v });
  });

  return (
    <figure className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Pantau
          <select value={metrikId} onChange={(e) => simpan(e.target.value as MetrikId, jenis)} className="field min-w-52 text-sm">
            {URUTAN_METRIK.map((id) => (
              <option key={id} value={id}>
                {METRIK[id].label}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Jenis grafik" className="inline-flex rounded-lg border p-0.5">
          {(["batang", "garis"] as const).map((j) => (
            <button
              key={j}
              type="button"
              aria-pressed={jenis === j}
              onClick={() => simpan(metrikId, j)}
              className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                jenis === j ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {j === "batang" ? "Batang" : "Garis"}
            </button>
          ))}
        </div>
      </div>

      <figcaption className="text-sm text-muted-foreground">
        {m.tanya} {m.catatan && <span className="text-xs">{m.catatan}</span>}
        <span className="block text-xs">Pegawai wajib lapor: {cakupan} ({hari[0].wajib} orang).</span>
      </figcaption>

      <div className="grid grid-cols-3 gap-2">
        <Statistik label="Rata-rata per hari" nilai={fmt(rata)} ket={`${n} hari kerja`} />
        <Statistik label="Hari terakhir" nilai={fmt(nilai[iTerakhir])} ket={`${labelHari(hari[iTerakhir].tanggal)} · ${m.rinci(hari[iTerakhir])}`} />
        {m.ambang ? (
          <Statistik
            label={`Di bawah ${ACUAN_BAIK}%`}
            nilai={`${diBawah} hari`}
            ket={diBawah && iTerendah >= 0 ? `terendah ${labelHari(hari[iTerendah].tanggal)} (${fmt(nilai[iTerendah])})` : "semua memenuhi acuan"}
          />
        ) : (
          <Statistik label="Terendah" nilai={fmt(iTerendah >= 0 ? nilai[iTerendah] : null)} ket={iTerendah >= 0 ? labelHari(hari[iTerendah].tanggal) : undefined} />
        )}
      </div>

      <div className="flex gap-2" aria-hidden>
        <div className="relative h-48 w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          {[...skala, ...(m.ambang ? [ACUAN_BAIK] : [])].map((v) => (
            <span
              key={`${v}-${v === ACUAN_BAIK && m.ambang ? "a" : "s"}`}
              className={`absolute right-0 -translate-y-1/2 ${m.ambang && v === ACUAN_BAIK ? "font-semibold text-amber-700 dark:text-amber-300" : ""}`}
              style={{ top: `${100 - tinggi(v)}%` }}
            >
              {fmt(v)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48">
            {skala.slice(0, 2).map((v) => (
              <div key={v} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${100 - tinggi(v)}%` }} />
            ))}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-line-strong" />
            {m.ambang && (
              <div className="pointer-events-none absolute inset-x-0 z-[2] border-t-2 border-dashed border-amber-500/80" style={{ top: `${100 - ACUAN_BAIK}%` }} />
            )}

            {jenis === "garis" && (
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-visible">
                {segmen
                  .filter((s) => s.length > 0)
                  .map((s, k) => {
                    const titik = s.map((p) => `${x(p.i)},${100 - tinggi(p.v)}`).join(" ");
                    const area = `${x(s[0].i)},100 ${titik} ${x(s[s.length - 1].i)},100`;
                    return (
                      <g key={k}>
                        <polygon points={area} fill="var(--color-brand-500)" opacity={0.12} />
                        <polyline points={titik} fill="none" stroke="var(--color-brand-500)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                      </g>
                    );
                  })}
              </svg>
            )}

            <div className="absolute inset-0 z-[3] flex">
              {hari.map((h, i) => {
                const v = nilai[i];
                return (
                  <div key={h.tanggal} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end px-[1.5px] sm:px-[3px]">
                    {jenis === "batang" ? (
                      <div className="flex h-full w-full flex-col justify-end rounded-t-[3px] bg-track/50">
                        {v !== null && <div className={`w-full rounded-t-[3px] ${warna(v)} transition-opacity group-hover:opacity-80`} style={{ height: `${tinggi(v)}%` }} />}
                      </div>
                    ) : (
                      <>
                        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/0 group-hover:bg-foreground/15" />
                        {v !== null && (
                          <span
                            className={`absolute left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-background ${warna(v)}`}
                            style={{ bottom: `${tinggi(v)}%` }}
                          />
                        )}
                      </>
                    )}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-48 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-[11px] text-background shadow-lg group-hover:block">
                      <p className="font-semibold">{labelHari(h.tanggal)}</p>
                      <p className="mt-0.5 text-background/85">
                        {m.label}: {fmt(v)}
                      </p>
                      <p className="text-background/85">{m.rinci(h)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-1.5 flex">
            {hari.map((h, i) => (
              <span key={h.tanggal} className={`min-w-0 flex-1 text-center text-[10px] leading-tight tabular-nums text-muted-foreground ${rapat && i % 2 ? "max-sm:invisible" : ""}`}>
                {Number(h.tanggal.slice(8))}
                {!rapat && <span className="block">{namaHari(h.tanggal)}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {m.ambang ? (
          <>
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-brand-500" />≥ 80% baik</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-gold-500" />50–79% perlu perhatian</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-red-500" />&lt; 50% rendah</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className="w-4 border-t-2 border-dashed border-amber-500" />acuan 80%</span>
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className={jenis === "garis" ? "w-4 border-t-2 border-brand-500" : "size-2.5 rounded-sm bg-brand-500"} />
            {m.label}
            {m.persen ? " (%)" : " (jumlah)"}
          </span>
        )}
        <span>Ketuk atau arahkan kursor ke kolom untuk rincian.</span>
      </div>

      <table className="sr-only">
        <caption>{m.label} per hari kerja</caption>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>{m.label}</th>
            <th>Rincian</th>
          </tr>
        </thead>
        <tbody>
          {hari.map((h, i) => (
            <tr key={h.tanggal}>
              <td>{labelHari(h.tanggal)}</td>
              <td>{fmt(nilai[i])}</td>
              <td>{m.rinci(h)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
