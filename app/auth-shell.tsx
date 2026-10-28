import { Lambang } from "./brand";

/** Kerangka halaman masuk / ganti password: sorotan merek di kiri, kartu kaca berisi formulir di kanan. */
export function AuthShell({ judul, keterangan, children }: { judul: string; keterangan: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <aside className="relative hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3 animate-[riseIn_0.7s_var(--e-out)_0.14s_both]">
          <Lambang ukuran={44} />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">BPS Kabupaten Kerinci</div>
            <div className="text-xs text-ink-muted">Badan Pusat Statistik</div>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="chip hero-chip mb-4">Pekerjaan Harian &amp; SKP</p>
          <p className="hero-judul !text-[clamp(2.25rem,1.4rem+2.6vw,3.9rem)] font-medium">
            <span className="ln">
              <span>Pekerjaan harian tercatat,</span>
            </span>
            <span className="ln">
              <span style={{ animationDelay: "0.67s" }}>capaian SKP terukur.</span>
            </span>
          </p>
          <p className="hero-blurb mt-4 max-w-md text-[15.2px] font-medium leading-6 tracking-[-0.01em] text-ink-soft">
            Catat pekerjaan, verifikasi oleh ketua tim, dan rekap bulanan SKP dalam satu tempat — dengan bukti dukung yang rapi dan arsip yang dapat ditelusuri.
          </p>
        </div>
        <p className="text-xs text-ink-muted">© Badan Pusat Statistik Kabupaten Kerinci</p>
      </aside>

      <main className="flex flex-col justify-center px-4 py-10 sm:px-12">
        <div className="panel mx-auto flex w-full max-w-md animate-[riseIn_0.9s_var(--e-out)_0.5s_both] flex-col gap-6 p-6 sm:p-8">
          <div className="flex items-center gap-3 lg:hidden">
            <Lambang />
            <div className="text-sm font-semibold leading-tight">
              BPS Kabupaten Kerinci
              <div className="text-xs font-normal text-ink-muted">Dashboard Pekerjaan Harian</div>
            </div>
          </div>
          <header>
            <h1 className="text-3xl">{judul}</h1>
            <p className="mt-1.5 text-sm text-ink-muted">{keterangan}</p>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
