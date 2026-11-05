"use client";

import type { AnalitikPegawai, BarisPegawai } from "@/lib/pegawai-insight";
import { wajibLapor } from "@/lib/wajib-lapor";

/*
 * Grafik pendukung halaman "Informasi Pegawai". Tanpa pustaka eksternal (SVG + CSS) supaya
 * ringan dan konsisten dengan dashboard utama. Semua nilai punya label teks sebagai cadangan
 * (bukan hanya warna) agar dapat diakses pembaca layar.
 *
 * Cara baca tren harian (dua angka, satu skala, tanpa normalisasi ganda):
 *  - Setiap hari = satu batang bertumpuk. Bagian BIRU = pegawai yang mengisi (dasar),
 *    bagian BIRU MUDA = entri tambahan di atas 1× pengisi. Jadi:
 *      tinggi biru padat  = banyak pegawai yang mengisi hari itu;
 *      tinggi biru muda   = sisa entri (entri − pegawai pengisi);
 *      tinggi total       = jumlah entri hari itu.
 *  - Sumbu Y (0, ½ maks, maks) dicetak di kiri agar tinggi batang punya acuan angka.
 *  - Tidak ada garis melayang: dulu garis "pegawai mengisi" dinormalisasi dengan skala
 *    sendiri sehingga terlihat seperti angka acak — kini digantikan segmen bertumpuk
 *    yang skalanya sama dengan batang entri.
 *
 * Warna seri: status & nada memakai token status yang sama dengan grafik dashboard utama
 * dan badge status; trek/grid memakai token (--color-track, --color-border) sehingga
 * otomatis menyesuaikan mode terang/gelap — tidak ada warna hex mentah.
 */

const desimal = (n: number) => String(n).replace(".", ",");
const tgl = (iso: string) => Number(iso.slice(8));
const NAMA_HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const namaHari = (iso: string) => NAMA_HARI[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** Warna status konsisten dengan grafik dashboard (grafik.tsx) dan badge status. */
const WARNA_STATUS: Record<string, string> = {
  DISETUJUI: "var(--color-brand-500)",
  MENUNGGU: "var(--color-gold-500)",
  MINTA_REVISI: "var(--color-red-500)",
  DITOLAK: "var(--color-red-600)",
};

/** Palet seri netral untuk komposisi peran (bukan status) — urutan tetap, tidak bergantung data. */
const WARNA_SERI = [
  "var(--color-brand-500)",
  "var(--color-gold-500)",
  "var(--color-green-600)",
  "var(--color-track-strong)",
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
        {/* Trek memakai token border: otomatis gelap/terang sesuai mode. */}
        <circle cx="21" cy="21" r={r} fill="none" strokeWidth="5" className="stroke-track-strong" />
        {data.sebaranStatus.map((s) => {
          const p = (s.jumlah / total) * 100;
          const el = (
            <circle
              key={s.status}
              cx="21"
              cy="21"
              r={r}
              fill="none"
              stroke={WARNA_STATUS[s.status] ?? "var(--color-track-strong)"}
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
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: WARNA_STATUS[s.status] ?? "var(--color-track-strong)" }} />
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
                <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: WARNA_SERI[i % WARNA_SERI.length] }} />
                {p.label}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {p.jumlah} <span className="text-xs">({desimal(persen)}%)</span>
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-track"
              role="meter"
              aria-label={`${p.label}: ${p.jumlah} orang`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={p.jumlah}
            >
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{ width: `${persen}%`, background: WARNA_SERI[i % WARNA_SERI.length] }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Tren pencatatan harian — batang bertumpuk, satu skala untuk kedua angka:
 * segmen bawah (biru padat) = pegawai yang mengisi; segmen atas (biru muda) = entri
 * tambahan di atas 1× pengisi. Tinggi total = jumlah entri. Sumbu Y tercetak di kiri
 * (0 / ½ maks / maks) supaya tinggi batang punya acuan angka, dan setiap batang diberi
 * label jumlah entri di atasnya. Hari ini ditandai batang lebih gelap + titik penanda.
 */
export function TrenHarianPegawai({ data }: { data: AnalitikPegawai }) {
  if (data.barisHari.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada aktivitas harian pada periode ini.</p>;
  }
  const maksEntri = Math.max(1, ...data.barisHari.map((h) => h.jumlah));
  const maksGaris = maksEntri * 1.15; // ruang kepala untuk label nilai di atas batang tertinggi
  const setengah = Math.round(maksEntri / 2);
  const hariIni = new Date().toISOString().slice(0, 10);
  const n = data.barisHari.length;
  const tunggal = n === 1; // 1 hari: jangan batang lebar penuh (tampak seperti kesalahan)

  // Sumbu Y: 0, ½ maks, maks (posisi bottom % relatif maksGaris agar ada ruang kepala).
  const skala = [
    { v: 0, bawah: 0 },
    { v: setengah, bawah: (setengah / maksGaris) * 100 },
    { v: maksEntri, bawah: (maksEntri / maksGaris) * 100 },
  ];

  return (
    <figure>
      <div className="relative flex h-56 pl-8 pr-6" aria-hidden>
        {/* Garis grid + label sumbu Y */}
        {skala.map((g) => (
          <div key={g.v} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border" style={{ bottom: `${g.bawah}%` }}>
            <span className="absolute -top-2 -left-8 w-6 text-right text-[10px] tabular-nums text-muted-foreground">{g.v}</span>
          </div>
        ))}
        {/* Garis dasar sumbu (solid, lebih tegas dari grid). */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-line-strong" />

        {/* Batang bertumpuk: pengisi (biru padat) + entri berlebih (biru muda).
            Wadah kolom justify-end; kedua segmen punya tinggi eksplisit (% dari
            skala yang SAMA = maksGaris), jadi segmen atas otomatis menempel di atas
            segmen bawah dan tinggi total = jumlah entri. */}
        <div className={`flex flex-1 items-end gap-[3px] sm:gap-1.5 ${tunggal ? "mx-auto w-24" : ""}`}>
          {data.barisHari.map((h) => {
            const iniHariIni = h.tanggal === hariIni;
            const tinggiPegawai = (h.pegawai / maksGaris) * 100;
            const tinggiSisa = Math.max(0, (h.jumlah - h.pegawai) / maksGaris) * 100;
            return (
              <div key={h.tanggal} className="group relative flex h-full flex-1 flex-col justify-end">
                {/* Segmen bawah: pegawai yang mengisi */}
                <div
                  className={`w-full transition-opacity group-hover:opacity-80 ${
                    iniHariIni ? "bg-brand-600 dark:bg-brand-300" : "bg-brand-500 dark:bg-brand-400"
                  }`}
                  style={{ height: `${tinggiPegawai}%` }}
                />
                {/* Segmen atas: entri tambahan di luar 1× pengisi */}
                {tinggiSisa > 0 && (
                  <div
                    className="w-full rounded-t-[3px] bg-brand-200 dark:bg-brand-600"
                    style={{ height: `${tinggiSisa}%` }}
                  />
                )}
                {iniHariIni && (
                  <span className="pointer-events-none absolute -top-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand-600 dark:bg-brand-300" />
                )}
                {/* Nilai di atas batang — warna teks normal penuh, tidak pernah menimpa batang. */}
                <span className="pointer-events-none absolute -top-4 left-1/2 w-full -translate-x-1/2 text-center text-[11px] font-medium tabular-nums leading-none text-foreground">
                  {h.jumlah}
                </span>
                {/* Tooltip */}
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-7 hidden w-44 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-[11px] text-background shadow-lg group-hover:block">
                  <p className="font-semibold">
                    {namaHari(h.tanggal)}, {h.tanggal}
                  </p>
                  <p className="mt-0.5 text-background/85">{h.jumlah} entri · {h.pegawai} pegawai mengisi</p>
                  {h.jumlah > h.pegawai && <p className="text-background/85">+{h.jumlah - h.pegawai} entri susulan</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sumbu X: nama hari + tanggal bila kolom cukup lebar (≤ 12 hari); bila hari
          banyak (kolom sempit), cukup angka tanggal — nama hari & tanggal lengkap
          tetap ada di tooltip. Pola selektif mobile mengikuti grafik dashboard. */}
      <div className="mt-1.5 flex gap-[3px] pl-8 pr-6 sm:gap-1.5" aria-hidden>
        {data.barisHari.map((h, i) => {
          const kolomSempit = data.barisHari.length > 12;
          return (
            <span
              key={h.tanggal}
              className={`flex-1 text-center text-[10px] tabular-nums text-muted-foreground ${kolomSempit && i % 2 ? "max-sm:invisible" : ""}`}
            >
              {kolomSempit ? tgl(h.tanggal) : `${namaHari(h.tanggal)} ${tgl(h.tanggal)}`}
            </span>
          );
        })}
      </div>

      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-brand-500 dark:bg-brand-400" />
          Pegawai mengisi
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-brand-200 dark:bg-brand-600" />
          Entri tambahan (sisa)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-brand-600 dark:bg-brand-300 ring-1 ring-foreground/20" />
          Hari ini
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

/** Kelengkapan pengisian per pegawai (batang horizontal), urut dari yang terendah.
 *  Persen dihitung terhadap hari kerja yang sudah BERLALU (periode berjalan) atau
 *  seluruh hari kerja (periode selesai) — disesuaikan di server (lib/pegawai-insight). */
export function KelengkapanPegawai({ baris }: { baris: BarisPegawai[] }) {
  const punya = baris.filter((b) => wajibLapor(b) && b.hariKerjaBerlalu > 0);
  if (punya.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Belum ada hari kerja berjalan pada periode ini.</p>;
  }
  const urut = [...punya].sort((a, b) => (a.persenHariTerisi ?? 0) - (b.persenHariTerisi ?? 0)).slice(0, 12);
  return (
    <ul className="space-y-3">
      {urut.map((b) => {
        const p = b.persenHariTerisi ?? 0;
        const nada = p >= 80 ? "bg-brand-500" : p >= 50 ? "bg-gold-500" : "bg-red-500";
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
              className="h-2 overflow-hidden rounded-full bg-track"
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

/** Pegawai paling aktif (jumlah entri) — grafik batang horizontal. */
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
          <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-track sm:w-32">
            <span
              className="block h-full rounded-full bg-brand-500 transition-[width] duration-700"
              style={{ width: `${Math.max(4, (t.nilai / maks) * 100)}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{t.nilai} entri</span>
        </li>
      ))}
    </ul>
  );
}
