"use client";

import type { AnalitikPegawai, BarisPegawai } from "@/lib/pegawai-insight";
import { wajibLapor } from "@/lib/wajib-lapor";

/*
 * Grafik pendukung halaman "Informasi Pegawai". Tanpa pustaka eksternal (CSS/SVG) supaya ringan
 * dan konsisten dengan dashboard utama. Setiap grafik menjawab SATU pertanyaan:
 *  - Pemantauan harian: beberapa metrik per hari kerja, batang/garis (lihat pemantauan-harian.tsx).
 *  - Status verifikasi: seberapa besar antrean verifikasi dibanding yang sudah selesai?
 *  - Perlu diingatkan : siapa yang paling jarang mengisi?
 * Warna selalu disertai teks/angka (bukan satu-satunya penanda) agar terbaca pembaca layar.
 */

const desimal = (n: number) => String(n).replace(".", ",");
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
  // Offset tiap segmen dihitung di muka (tanpa memutasi variabel saat render): 25 = mulai dari arah jam 12.
  const segmen = data.sebaranStatus.map((s) => ({ s, p: (s.jumlah / total) * 100 }));
  const offsets = segmen.map((_, i) => 25 - segmen.slice(0, i).reduce((a, x) => a + x.p, 0));
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
        {segmen.map(({ s, p }, i) => (
            <circle
              key={s.status}
              cx="21"
              cy="21"
              r={r}
              fill="none"
              stroke={WARNA_STATUS[s.status] ?? "var(--color-track-strong)"}
              strokeWidth="5"
              strokeDasharray={`${p} ${100 - p}`}
              strokeDashoffset={offsets[i]}
            />
        ))}
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
