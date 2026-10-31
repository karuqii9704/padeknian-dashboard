const MAP: Record<string, { label: string; cls: string; titik: string }> = {
  MENUNGGU: { label: "Menunggu verifikasi", cls: "bg-gold-50 text-gold-700 ring-gold-200 dark:bg-gold-900/30 dark:text-gold-200 dark:ring-gold-800", titik: "bg-gold-500 dark:bg-gold-400" },
  DISETUJUI: { label: "Disetujui", cls: "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/30 dark:text-brand-200 dark:ring-brand-800", titik: "bg-brand-500 dark:bg-brand-400" },
  MINTA_REVISI: { label: "Perlu revisi", cls: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-900/30 dark:text-red-200 dark:ring-red-800", titik: "bg-red-500 dark:bg-red-400" },
  DITOLAK: { label: "Ditolak", cls: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-900/30 dark:text-red-200 dark:ring-red-800", titik: "bg-red-600 dark:bg-red-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, cls: "bg-gray-100 text-gray-800 ring-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700", titik: "bg-gray-400 dark:bg-gray-500" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${m.cls}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${m.titik}`} />
      {m.label}
    </span>
  );
}
