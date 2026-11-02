export function ProgressBar({ persen, label }: { persen: number; label?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(persen)));
  // Warna mengikuti capaian: emas saat berjalan, hijau merek saat tuntas.
  return (
    <div className="flex items-center gap-2.5" aria-label={label}>
      <div role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-track">
        <div className={`h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${p >= 100 ? "bg-brand-500" : "bg-gold-400"}`} style={{ width: `${p}%` }} />
      </div>
      <span className={`w-10 text-right text-xs font-medium tabular-nums ${p >= 100 ? "text-brand-700" : "text-ink-soft"}`}>{p}%</span>
    </div>
  );
}
