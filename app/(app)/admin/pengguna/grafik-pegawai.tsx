"use client";

import type { AnalitikPegawai, BarisPegawai } from "@/lib/pegawai-insight";

/*
 * Grafik pendukung halaman "Informasi Pegawai". Tanpa pustaka eksternal (SVG + CSS) supaya
 * ringan dan konsisten dengan dashboard utama. Semua nilai punya label teks sebagai cadangan
 * (bukan hanya warna) agar dapat diakses pembaca layar.
 */

const desimal = (n: number) => String(n).replace(".", ",");
const tgl = (iso: string) => Number(iso.slice(8));

const WARNA_STATUS: Record<string, string> = {
  DISETUJUI: "var(--color-brand-500)",
  MENUNGGU: "var(--color-gold-400)",
  MINTA_REVISI: "var(--color-red-500)",
  DITOLAK: "var(--color-red-600)",
};

const WARNA_PERAN = [
  "var(--color-brand-500)",
  "var(--color-gold-400)",
  "var(--color-green-600)",
  "var(--color-gray-400)",
];

/** Donat sebaran status verifikasi — memakai teknik stroke-dasharray pada SVG. */
export function DonatStatusVerifikasi({ data }: { data: AnalitikPegawai }) {
  const total = data.sebaranStatus.reduce((a, s) => a + s.jumlah, 0);
  if (total === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada catatan pekerjaan pada periode ini.</p>;
  }
  const r = 15.915; // keliling = 100
  let offset = 25;
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg
        viewBox="0 0 42 42"
        className="size-36 shrink-0"
        role="img"
        aria-label={`Sebaran status verifikasi: ${data.sebaranStatus.map((s) => `${s.label} ${s.jumlah}`).join(", ")}`}
      >
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--color-gray-200)" strokeWidth="5" />
        {data.sebaranStatus.map((s) => {
          const p = (s.jumlah / total) * 100;
          const el = (
            <circle
              key={s.status}
              cx="21"
              cy="21"
              r={r}
              fill="none"
              stroke={WARNA_STATUS[s.status] ?? "var(--color-gray-400)"}
              strokeWidth="5"
              strokeDasharray={`${p} ${100 - p}`}
              strokeDashoffset={offset}
            />
          );
          offset -= p;
          return el;
        })}
        <text x="21" y="20" textAnchor="middle" className="fill-foreground text-[7px] font-medium">
          {total}
        </text>
        <text x="21" y="26" textAnchor="middle" className="fill-muted-foreground text-[3.5px]">
          catatan
        </text>
      </svg>
      <ul className="min-w-[13rem] flex-1 space-y-2 text-sm">
        {data.sebaranStatus.map((s) => (
          <li key={s.status} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: WARNA_STATUS[s.status] ?? "var(--color-gray-400)" }} />
            <span className="flex-1 text-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">{s.jumlah}</span>
            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
              {total ? `${desimal(Math.round((s.jumlah / total) * 1000) / 10)}%` : "–"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Batang horizontal komposisi peran pegawai. */
export function BatangPeran({ data }: { data: AnalitikPegawai }) {
  if (data.sebaranPeran.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data pegawai.</p>;
  }
  const total = data.sebaranPeran.reduce((a, p) => a + p.jumlah, 0);
  return (
    <ul className="space-y-3">
      {data.sebaranPeran.map((p, i) => {
        const persen = total ? Math.round((p.jumlah / total) * 1000) / 10 : 0;
        return (
          <li key={p.role}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 truncate font-medium text-foreground">
                <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: WARNA_PERAN[i % WARNA_PERAN.length] }} />
                {p.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {p.jumlah} <span className="text-xs">({desimal(persen)}%)</span>
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
              role="meter"
              aria-label={`${p.label}: ${p.jumlah} orang`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={p.jumlah}
            >
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${persen}%`, background: WARNA_PERAN[i % WARNA_PERAN.length] }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Tren pencatatan harian: jumlah entri per hari (batang) + jumlah pegawai yang mengisi (garis).
 * Dua skala dinormalisasi agar satu grafik tetap terbaca.
 */
export function TrenHarianPegawai({ data }: { data: AnalitikPegawai }) {
  if (data.barisHari.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada aktivitas harian pada periode ini.</p>;
  }
  const maksEntri = Math.max(1, ...data.barisHari.map((h) => h.jumlah));
  const maksPegawai = Math.max(1, ...data.barisHari.map((h) => h.pegawai));
  const tinggi = 11; // tinggi grafik dalam satuan viewBox
  const lebar = 100;
  const titik = data.barisHari.map((h, i) => {
    const x = ((i + 0.5) / data.barisHari.length) * lebar;
    const y = 30 - (h.pegawai / maksPegawai) * (tinggi - 2) - 1;
    return [x, y] as const;
  });
  const garis = titik.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

  return (
    <figure>
      <div className="relative flex h-48 items-end gap-[2px] sm:gap-1" aria-hidden>
        {/* Garis jumlah pegawai yang mengisi */}
        <svg viewBox={`0 0 ${lebar} 32`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full text-gold-400">
          <path d={garis} fill="none" stroke="currentColor" strokeWidth="0.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
          {titik.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="0.9" fill="currentColor" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {data.barisHari.map((h, i) => (
          <div key={h.tanggal} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[3px] bg-brand-500/85 transition-opacity group-hover:opacity-70"
              style={{ height: `${(h.jumlah / maksEntri) * 100}%` }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-40 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-[11px] text-background shadow-lg group-hover:block">
              <p className="font-semibold">{h.tanggal}</p>
              <p className="mt-0.5 text-foreground/70">
                {h.jumlah} entri · {h.pegawai} pegawai mengisi
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] sm:gap-1" aria-hidden>
        {data.barisHari.map((h, i) => (
          <span
            key={h.tanggal}
            className={`flex-1 text-center text-[10px] tabular-nums text-muted-foreground ${data.barisHari.length > 12 && i % 2 ? "max-sm:invisible" : ""}`}
          >
            {tgl(h.tanggal)}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-brand-500" />
          Jumlah entri per hari
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-gold-400" />
          Jumlah pegawai mengisi
        </span>
      </figcaption>
      {/* Data tabel untuk pembaca layar */}
      <div className="sr-only">
        <table>
          <caption>Catatan harian</caption>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Jumlah entri</th>
              <th>Jumlah pegawai mengisi</th>
            </tr>
          </thead>
          <tbody>
            {data.barisHari.map((h) => (
              <tr key={h.tanggal}>
                <td>{h.tanggal}</td>
                <td>{h.jumlah}</td>
                <td>{h.pegawai}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Kelengkapan pengisian per pegawai (batang horizontal), urut dari yang terendah. */
export function KelengkapanPegawai({ baris }: { baris: BarisPegawai[] }) {
  const punya = baris.filter((b) => b.hariKerjaBerlalu > 0);
  if (punya.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada hari kerja berjalan pada periode ini.</p>;
  }
  const urut = [...punya].sort((a, b) => (a.persenHariTerisi ?? 0) - (b.persenHariTerisi ?? 0)).slice(0, 12);
  return (
    <ul className="space-y-3">
      {urut.map((b) => {
        const p = b.persenHariTerisi ?? 0;
        const nada = p >= 80 ? "bg-brand-500" : p >= 50 ? "bg-gold-400" : "bg-red-500";
        return (
          <li key={b.userId}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-foreground">{b.nama}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {b.persenHariTerisi === null ? "–" : `${desimal(b.persenHariTerisi)}%`}
                <span className="ml-1.5 text-xs">
                  ({b.hariTerisi}/{b.hariKerjaBerlalu} hari)
                </span>
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
              role="meter"
              aria-label={`Kelengkapan pengisian ${b.nama}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={p}
            >
              <div className={`h-full rounded-full ${nada} transition-[width] duration-700`} style={{ width: `${Math.min(100, p)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Pegawai paling aktif (jumlah entri) — grafik batang vertikal. */
export function PegawaiTeraktif({ data }: { data: AnalitikPegawai }) {
  if (data.topAktif.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada pegawai yang mencatat pekerjaan.</p>;
  }
  const maks = Math.max(...data.topAktif.map((t) => t.nilai));
  return (
    <ul className="space-y-2.5">
      {data.topAktif.map((t, i) => (
        <li key={t.userId} className="flex items-center gap-3">
          <span aria-hidden className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{t.nama}</span>
          <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 sm:w-32">
            <span
              className="block h-full rounded-full bg-brand-500/85"
              style={{ width: `${Math.max(4, (t.nilai / maks) * 100)}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{t.nilai} entri</span>
        </li>
      ))}
    </ul>
  );
}
