import Link from "next/link";
import type { Analitik } from "@/lib/dashboard-analitik";

/*
 * Grafik dashboard tanpa pustaka (HTML/CSS + SVG): ringan, berjalan offline, dan dapat dibaca
 * pembaca layar lewat tabel data tersembunyi. Warna status konsisten di seluruh aplikasi:
 * disetujui = hijau merek, menunggu = emas, revisi/ditolak = merah.
 */

const WARNA = { disetujui: "var(--color-brand-500)", menunggu: "var(--color-gold-500)", revisi: "var(--color-red-500)" } as const;
const desimal = (n: number) => String(n).replace(".", ",");
const tgl = (iso: string) => Number(iso.slice(8));

export function Legenda({ className = "", kosong }: { className?: string; kosong?: boolean }) {
  return (
    <ul className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground ${className}`}>
      {kosong && <li className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-track-strong" />Kosong</li>}
      <li className="flex items-center gap-1.5"><span aria-hidden className={`size-2.5 rounded-sm`} style={{ background: WARNA.disetujui }} />Disetujui</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className={`size-2.5 rounded-sm`} style={{ background: WARNA.menunggu }} />Menunggu</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className={`size-2.5 rounded-sm`} style={{ background: WARNA.revisi }} />Revisi/ditolak</li>
    </ul>
  );
}

/** Donat sebaran status verifikasi seluruh entri periode. */
export function DonatStatus({ status }: { status: Analitik["status"] }) {
  const total = status.disetujui + status.menunggu + status.revisi;
  const r = 15.915; // keliling = 100
  const segmen = [
    { n: status.disetujui, warna: "var(--color-brand-500)", label: "Disetujui" },
    { n: status.menunggu, warna: "var(--color-gold-500)", label: "Menunggu" },
    { n: status.revisi, warna: "var(--color-red-500)", label: "Revisi/ditolak" },
  ];
  let offset = 25;
  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <svg viewBox="0 0 42 42" className="size-32 shrink-0" role="img" aria-label={`Sebaran status: ${segmen.map((s) => `${s.label} ${s.n}`).join(", ")}`}>
        <circle cx="21" cy="21" r={r} fill="none" strokeWidth="5" className="stroke-track-strong" />
        {total > 0 &&
          segmen.map((s) => {
            const p = (s.n / total) * 100;
            const el = <circle key={s.label} cx="21" cy="21" r={r} fill="none" stroke={s.warna} strokeWidth="5" strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={offset} />;
            offset -= p;
            return el;
          })}
        <text x="21" y="20.5" textAnchor="middle" className="fill-foreground text-[7px] font-semibold tabular-nums">{total}</text>
        <text x="21" y="26" textAnchor="middle" className="fill-muted-foreground text-[3.2px]">entri</text>
      </svg>
      <ul className="min-w-[13rem] flex-1 space-y-2 text-sm">
        {segmen.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: s.warna }} />
            <span className="flex-1 text-foreground">{s.label}</span>
            <span className="font-medium tabular-nums">{s.n}</span>
            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{total ? `${desimal(Math.round((s.n / total) * 1000) / 10)}%` : "–"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Batang horizontal kepatuhan pengisian per tim. */
export function KepatuhanTim({ tim }: { tim: Analitik["perTim"] }) {
  if (tim.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">Belum ada tim pada cakupan ini.</p>;
  const urut = [...tim].sort((a, b) => (b.persenKepatuhan ?? -1) - (a.persenKepatuhan ?? -1));
  return (
    <ul className="space-y-3.5">
      {urut.map((t) => {
        const p = t.persenKepatuhan ?? 0;
        const nada = p >= 80 ? "bg-brand-500" : p >= 50 ? "bg-gold-400" : "bg-red-500";
        return (
          <li key={t.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-ink-soft">{t.nama}</span>
              <span className="shrink-0 tabular-nums text-ink">{t.persenKepatuhan === null ? "–" : `${desimal(t.persenKepatuhan)}%`}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-track" role="meter" aria-label={`Kepatuhan pengisian ${t.nama}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
              <div className={`h-full rounded-full ${nada} transition-[width] duration-700`} style={{ width: `${Math.min(100, p)}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              {t.anggota} anggota · {t.entri} entri · {t.menunggu} menunggu{t.revisi > 0 && <> · <span className="text-red-700">{t.revisi} revisi</span></>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

const SEL_CLS = ["bg-track-strong", "bg-brand-500", "bg-gold-500", "bg-red-500"];
const SEL_LABEL = ["kosong", "disetujui", "menunggu", "revisi"];

/** Heatmap kepatuhan: pegawai × hari kerja. Pegawai paling jarang mengisi tampil di atas. */
export function HeatmapKepatuhan({ data, periodeId }: { data: Analitik; periodeId: string }) {
  const { hariKerja, heatmap } = data;
  if (heatmap.length === 0 || hariKerja.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">Belum ada data kepatuhan untuk ditampilkan.</p>;
  }
  return (
    <div className="max-h-[26rem] overflow-auto rounded-lg">
      <table className="border-separate border-spacing-[3px] text-xs">
        <thead className="!bg-transparent">
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-20 bg-solid pr-2 text-left !text-[10px] !normal-case !tracking-normal text-ink-muted">
              Nama
            </th>
            {hariKerja.map((t) => (
              <th key={t} scope="col" className="sticky top-0 z-10 w-5 min-w-5 bg-solid sm:w-6 text-center !text-[10px] font-medium !normal-case !tracking-normal tabular-nums text-ink-muted" title={t}>
                {tgl(t)}
              </th>
            ))}
            <th scope="col" className="sticky top-0 z-10 bg-solid pl-2 text-right !text-[10px] !normal-case !tracking-normal text-ink-muted">Terisi</th>
          </tr>
        </thead>
        <tbody>
          {heatmap.map((b) => {
            const persen = Math.round((b.terisi / hariKerja.length) * 100);
            return (
              <tr key={b.userId} data-heat={b.userId} className="hover:!bg-transparent">
                <th scope="row" className="sticky left-0 z-10 max-w-40 truncate bg-solid pr-2 text-left font-normal">
                  <Link href={`/dashboard/pegawai/${b.userId}?periodeId=${periodeId}`} className="text-ink-soft hover:text-brand-700 hover:underline">
                    {b.nama}
                  </Link>
                </th>
                {b.sel.map((s, i) => (
                  <td key={hariKerja[i]} className="p-0">
                    <span title={`${b.nama} · ${hariKerja[i]}: ${SEL_LABEL[s]}`} className={`block size-5 rounded-[4px] transition-transform hover:scale-125 sm:size-6 ${SEL_CLS[s]}`} />
                  </td>
                ))}
                <td className={`pl-2 text-right tabular-nums ${persen < 50 ? "font-semibold text-red-700" : "text-ink-muted"}`}>{persen}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
