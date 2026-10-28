import { IkonCentang, IkonInfo, IkonKosong, IkonPeringatan } from "./icons";

/** Kepala halaman: judul + keterangan di kiri, aksi di kanan (turun ke bawah di HP). */
export function PageHeader({ judul, keterangan, eyebrow, aksi }: { judul: string; keterangan?: React.ReactNode; eyebrow?: string; aksi?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <p className="chip hero-chip mb-3">{eyebrow}</p>}
        <h1 className="hero-judul">
          <span className="ln">
            <span>{judul}</span>
          </span>
        </h1>
        {keterangan && <div className="hero-blurb mt-2 max-w-[65ch] text-[15px] font-medium leading-6 text-ink-soft">{keterangan}</div>}
      </div>
      {aksi && <div className="flex flex-wrap items-center gap-2">{aksi}</div>}
    </header>
  );
}

const NADA = {
  galat: { cls: "border-red-200 bg-red-50 text-red-900", ikon: IkonPeringatan, ikonCls: "text-red-600" },
  peringatan: { cls: "border-amber-200 bg-amber-50 text-amber-950", ikon: IkonPeringatan, ikonCls: "text-amber-600" },
  sukses: { cls: "border-green-200 bg-green-50 text-green-900", ikon: IkonCentang, ikonCls: "text-green-700" },
  info: { cls: "border-line bg-surface-muted text-ink-soft", ikon: IkonInfo, ikonCls: "text-brand-600" },
} as const;

/** Pesan sebaris. `galat` → role=alert; selain itu role=status (dibacakan sopan). */
export function Alert({ nada, children, className = "" }: { nada: keyof typeof NADA; children: React.ReactNode; className?: string }) {
  const n = NADA[nada];
  const Ikon = n.ikon;
  return (
    <div role={nada === "galat" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${n.cls} ${className}`}>
      <Ikon className={`mt-px h-[18px] w-[18px] shrink-0 ${n.ikonCls}`} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Keadaan kosong yang menjelaskan cara mengisinya. */
export function EmptyState({ judul, keterangan, aksi, kecil }: { judul: string; keterangan?: React.ReactNode; aksi?: React.ReactNode; kecil?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${kecil ? "gap-1.5 px-4 py-6" : "gap-2 px-6 py-10"}`}>
      <span aria-hidden className="mb-1 flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-brand-100">
        <IkonKosong className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-ink-soft">{judul}</p>
      {keterangan && <p className="max-w-sm text-xs text-ink-muted">{keterangan}</p>}
      {aksi && <div className="mt-2">{aksi}</div>}
    </div>
  );
}

/** Kerangka pemuatan halaman: meniru tata letak judul + blok konten agar tidak "melompat". */
export function SkeletonHalaman({ lebar = "max-w-3xl", blok = 3 }: { lebar?: string; blok?: number }) {
  return (
    <main className={`mx-auto ${lebar} space-y-5 px-4 py-6 sm:px-6`} aria-busy="true">
      <span className="sr-only" role="status">Memuat…</span>
      <div className="space-y-2">
        <div className="skeleton h-3 w-7" />
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-4 w-72 max-w-full" />
      </div>
      {Array.from({ length: blok }).map((_, i) => (
        <div key={i} className="panel space-y-3 p-4">
          <div className="skeleton h-4 w-2/5" />
          <div className="skeleton h-3 w-4/5" />
          <div className="skeleton h-3 w-3/5" />
        </div>
      ))}
    </main>
  );
}

/** Wadah halaman standar. */
export function Halaman({ lebar = "max-w-3xl", children, className = "" }: { lebar?: string; children: React.ReactNode; className?: string }) {
  return <main className={`mx-auto ${lebar} space-y-5 px-4 py-6 sm:px-6 ${className}`}>{children}</main>;
}
