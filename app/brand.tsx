/** Lambang aplikasi: diagram batang (rujukan visual statistik), mengikuti warna teks. */
export function Lambang({ ukuran = 24, className = "" }: { ukuran?: number; className?: string }) {
  return (
    <svg aria-hidden width={ukuran} height={ukuran} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="2" y="12" width="5" height="10" rx="1.5" fill="currentColor" fillOpacity="0.45" />
      <rect x="9.5" y="7" width="5" height="15" rx="1.5" fill="currentColor" fillOpacity="0.7" />
      <rect x="17" y="2" width="5" height="20" rx="1.5" fill="#1975f2" />
    </svg>
  );
}
