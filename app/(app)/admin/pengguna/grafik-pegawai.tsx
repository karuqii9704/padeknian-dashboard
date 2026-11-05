"use client";

import type { AnalitikPegawai, BarisPegawai } from "@/lib/pegawai-insight";
import {
  ACUAN_BAIK,
  ACUAN_CUKUP,
  rataKepatuhan,
  type HariKepatuhan,
} from "@/lib/kepatuhan-harian";
import { wajibLapor } from "@/lib/wajib-lapor";

/*
 * Grafik pendukung halaman "Informasi Pegawai". Tanpa pustaka eksternal (CSS/SVG) supaya ringan
 * dan konsisten dengan dashboard utama. Setiap grafik menjawab SATU pertanyaan:
 *  - Kepatuhan harian : berapa persen pegawai wajib lapor yang mencatat pekerjaan tiap hari kerja?
 *  - Status verifikasi: seberapa besar antrean verifikasi dibanding yang sudah selesai?
 *  - Perlu diingatkan : siapa yang paling jarang mengisi?
 * Warna selalu disertai teks/angka (bukan satu-satunya penanda) agar terbaca pembaca layar.
 */

const desimal = (n: number) => String(n).replace(".", ",");
const NAMA_HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN_PENDEK = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
const namaHari = (iso: string) =>
  NAMA_HARI[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const labelHari = (iso: string) =>
  `${namaHari(iso)}, ${Number(iso.slice(8))} ${BULAN_PENDEK[Number(iso.slice(5, 7)) - 1]}`;

/** Nada kepatuhan: sama dengan pewarnaan kelengkapan per pegawai. */
const nadaPersen = (p: number) =>
  p >= ACUAN_BAIK
    ? "bg-brand-500"
    : p >= ACUAN_CUKUP
      ? "bg-gold-500"
      : "bg-red-500";

/** Warna status konsisten dengan grafik dashboard (grafik.tsx) dan badge status. */
const WARNA_STATUS: Record<string, string> = {
  DISETUJUI: "var(--color-brand-500)",
  MENUNGGU: "var(--color-gold-500)",
  MINTA_REVISI: "var(--color-red-500)",
  DITOLAK: "var(--color-red-600)",
};

/** Donat sebaran status verifikasi — memakai teknik stroke-dasharray pada SVG. */
export function DonatStatusVerifikasi({ data }: { data: AnalitikPegawai }) {
  const total = data.sebaranStatus.reduce((a, s) => a + s.jumlah, 0);
  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Belum ada catatan pekerjaan pada periode ini.
      </p>
    );
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
        <circle
          cx="21"
          cy="21"
          r={r}
          fill="none"
          strokeWidth="5"
          className="stroke-track-strong"
        />
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
        <text
          x="21"
          y="20"
          textAnchor="middle"
          className="fill-foreground text-[7px] font-medium"
        >
          {total}
        </text>
        <text
          x="21"
          y="26"
          textAnchor="middle"
          className="fill-muted-foreground text-[3.5px]"
        >
          catatan
        </text>
      </svg>
      <ul className="min-w-[13rem] flex-1 space-y-2 text-sm">
        {data.sebaranStatus.map((s) => (
          <li key={s.status} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{
                background:
                  WARNA_STATUS[s.status] ?? "var(--color-track-strong)",
              }}
            />
            <span className="flex-1 text-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">{s.jumlah}</span>
            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
              {total
                ? `${desimal(Math.round((s.jumlah / total) * 1000) / 10)}%`
                : "–"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Statistik({ label, nilai, ket }: { label: string; nilai: string; ket?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-2.5 py-2 sm:px-3">
      <p className="text-xs leading-snug text-muted-foreground">{label}</p>
      <p className="text-base font-semibold leading-tight tabular-nums text-foreground sm:text-lg">{nilai}</p>
      {ket && <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">{ket}</p>}
    </div>
  );
}

/**
 * Kepatuhan pengisian harian: satu batang per hari kerja yang sudah berjalan, tinggi = persen
 * pegawai wajib lapor yang mengisi hari itu (skala tetap 0–100%). Hari tanpa pengisi tetap tampil
 * (kolom kosong), garis putus-putus menandai acuan 80%.
 */
export function KepatuhanHarian({ hari }: { hari: HariKepatuhan[] }) {
  if (hari.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Belum ada hari kerja yang berjalan pada periode ini.
      </p>
    );
  }
  if (hari[0].wajib === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Belum ada pegawai aktif yang wajib mengisi catatan.
      </p>
    );
  }
  const rata = rataKepatuhan(hari) ?? 0;
  const terakhir = hari[hari.length - 1];
  const terendah = hari.reduce(
    (m, h) => ((h.persen ?? 0) < (m.persen ?? 0) ? h : m),
    hari[0],
  );
  const diBawahAcuan = hari.filter((h) => (h.persen ?? 0) < ACUAN_BAIK).length;
  const rapat = hari.length > 12;

  return (
    <figure className="space-y-4">
      <figcaption className="text-sm text-muted-foreground">
        Persentase pegawai (Pegawai &amp; Ketua Tim aktif, {terakhir.wajib}{" "}
        orang) yang mencatat minimal satu pekerjaan pada tiap hari kerja.
      </figcaption>

      <div className="grid grid-cols-3 gap-2">
        <Statistik label="Rata-rata per hari" nilai={`${desimal(rata)}%`} ket={`${hari.length} hari kerja`} />
        <Statistik label="Hari terakhir" nilai={`${terakhir.pengisi}/${terakhir.wajib}`} ket={`${labelHari(terakhir.tanggal)} · ${desimal(terakhir.persen ?? 0)}%`} />
        <Statistik
          label="Di bawah 80%"
          nilai={`${diBawahAcuan} hari`}
          ket={diBawahAcuan ? `terendah ${labelHari(terendah.tanggal)} (${desimal(terendah.persen ?? 0)}%)` : "semua memenuhi acuan"}
        />
      </div>

      <div className="flex gap-2" aria-hidden>
        {/* Sumbu Y: kolom sendiri agar label tidak terpotong. */}
        <div className="relative h-48 w-9 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          {[100, ACUAN_BAIK, 50, 0].map((v) => (
            <span
              key={v}
              className={`absolute right-0 -translate-y-1/2 ${v === ACUAN_BAIK ? "font-semibold text-amber-700 dark:text-amber-300" : ""}`}
              style={{ top: `${100 - v}%` }}
            >
              {v}%
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48">
            {[100, 50].map((v) => (
              <div
                key={v}
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border"
                style={{ top: `${100 - v}%` }}
              />
            ))}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-line-strong" />
            <div
              className="pointer-events-none absolute inset-x-0 z-[1] border-t-2 border-dashed border-amber-500/80"
              style={{ top: `${100 - ACUAN_BAIK}%` }}
            />
            <div className="relative flex h-full items-end gap-[3px] sm:gap-1.5">
              {hari.map((h) => {
                const p = h.persen ?? 0;
                return (
                  <div
                    key={h.tanggal}
                    className="group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-[3px] bg-track/50"
                  >
                    <div
                      className={`w-full rounded-t-[3px] ${nadaPersen(p)} transition-opacity group-hover:opacity-80`}
                      style={{ height: `${p}%` }}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden w-44 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-[11px] text-background shadow-lg group-hover:block">
                      <p className="font-semibold">{labelHari(h.tanggal)}</p>
                      <p className="mt-0.5 text-background/85">
                        {h.pengisi} dari {h.wajib} pegawai mengisi ({desimal(p)}
                        %)
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-1.5 flex gap-[3px] sm:gap-1.5">
            {hari.map((h, i) => (
              <span
                key={h.tanggal}
                className={`min-w-0 flex-1 text-center text-[10px] leading-tight tabular-nums text-muted-foreground ${rapat && i % 2 ? "max-sm:invisible" : ""}`}
              >
                {Number(h.tanggal.slice(8))}
                {!rapat && <span className="block">{namaHari(h.tanggal)}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-brand-500" />≥ 80%
          baik
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-gold-500" />
          50–79% perlu perhatian
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-red-500" />
          &lt; 50% rendah
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="w-4 border-t-2 border-dashed border-amber-500"
          />
          acuan 80%
        </span>
      </div>

      <table className="sr-only">
        <caption>Kepatuhan pengisian per hari kerja</caption>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Pegawai mengisi</th>
            <th>Persen</th>
          </tr>
        </thead>
        <tbody>
          {hari.map((h) => (
            <tr key={h.tanggal}>
              <td>{labelHari(h.tanggal)}</td>
              <td>
                {h.pengisi} dari {h.wajib}
              </td>
              <td>{desimal(h.persen ?? 0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Pegawai yang perlu diingatkan: kelengkapan pengisian per pegawai, urut dari yang terendah.
 *  Persen dihitung terhadap hari kerja yang sudah BERLALU (periode berjalan) atau
 *  seluruh hari kerja (periode selesai) — disesuaikan di server (lib/pegawai-insight). */
export function KelengkapanPegawai({ baris }: { baris: BarisPegawai[] }) {
  const punya = baris.filter((b) => wajibLapor(b) && b.hariKerjaBerlalu > 0);
  if (punya.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Belum ada hari kerja berjalan pada periode ini.
      </p>
    );
  }
  const urut = [...punya]
    .sort(
      (a, b) =>
        (a.persenHariTerisi ?? 0) - (b.persenHariTerisi ?? 0) ||
        a.nama.localeCompare(b.nama, "id"),
    )
    .slice(0, 12);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {urut.length} pegawai dengan hari kerja terisi paling sedikit (dari{" "}
        {punya.length} pegawai wajib lapor). Hubungi mereka agar rekap bulanan
        tidak kosong.
      </p>
      <ul className="space-y-3">
        {urut.map((b) => {
          const p = b.persenHariTerisi ?? 0;
          const nada =
            p >= 80 ? "bg-brand-500" : p >= 50 ? "bg-gold-500" : "bg-red-500";
          return (
            <li key={b.userId}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-foreground">
                  {b.nama}
                  {b.tim.length > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {b.tim.join(", ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {b.persenHariTerisi === null
                    ? "–"
                    : `${desimal(b.persenHariTerisi)}%`}
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
                <div
                  className={`h-full rounded-full ${nada} transition-[width] duration-700`}
                  style={{ width: `${Math.min(100, p)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
