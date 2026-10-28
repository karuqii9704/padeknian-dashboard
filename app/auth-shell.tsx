import { Lambang } from "./brand";

const SOROTAN = [
  { angka: "Harian", isi: "Pekerjaan dicatat setiap hari lengkap dengan bukti dukung." },
  { angka: "Terverifikasi", isi: "Ketua tim memeriksa dan menyetujui setiap entri." },
  { angka: "Bulanan", isi: "Rekap SKP dibuat otomatis per periode." },
];

/** Kerangka halaman masuk / ganti password: formulir di kiri, panel sorotan bergradasi di kanan (desktop). */
export function AuthShell({ judul, keterangan, children }: { judul: string; keterangan: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] bg-background lg:grid-cols-2">
      <main className="flex flex-col px-4 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center gap-2.5">
          <Lambang ukuran={24} />
          <span className="text-lg font-semibold tracking-tight">BPS Kerinci</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-sm flex-col gap-7 animate-masuk">
            <header className="space-y-2">
              <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">{judul}</h1>
              <p className="text-sm text-muted-foreground">{keterangan}</p>
            </header>
            {children}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© Badan Pusat Statistik Kabupaten Kerinci</p>
      </main>

      <aside className="hidden p-3 lg:block">
        <div className="flex h-full flex-col justify-between rounded-3xl border bg-[linear-gradient(347deg,var(--promo-from)_45%,var(--promo-to)_300%)] p-10">
          <span className="w-fit rounded-xl bg-primary px-2.5 py-1.5 text-xs font-medium tracking-tight text-primary-foreground">Pekerjaan Harian &amp; SKP</span>
          <div className="space-y-8">
            <p className="max-w-md text-4xl font-medium leading-tight tracking-tight">Pekerjaan harian tercatat, capaian SKP terukur.</p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {SOROTAN.map((s) => (
                <li key={s.angka} className="rounded-2xl border bg-background/80 p-4 backdrop-blur">
                  <p className="text-sm font-medium">{s.angka}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.isi}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
