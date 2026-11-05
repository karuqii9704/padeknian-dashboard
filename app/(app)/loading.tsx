import { Skeleton } from "@/components/ui/skeleton";

// Ditampilkan seketika saat berpindah halaman selama data dirender di server (halaman bersifat dinamis).
export default function Memuat() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Memuat halaman…</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
