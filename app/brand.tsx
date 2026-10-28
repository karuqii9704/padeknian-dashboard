/** Lambang aplikasi: diagram batang putih pada lencana kaca (rujukan visual statistik). */
export function Lambang({ ukuran = 36 }: { ukuran?: number }) {
  return (
    <svg aria-hidden width={ukuran} height={ukuran} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="12" fill="#fff" fillOpacity="0.14" />
      <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="11.25" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.5" />
      <rect x="9" y="21" width="5" height="10" rx="1.5" fill="#fff" fillOpacity="0.6" />
      <rect x="17.5" y="14" width="5" height="17" rx="1.5" fill="#fff" fillOpacity="0.8" />
      <rect x="26" y="9" width="5" height="22" rx="1.5" fill="#fff" />
    </svg>
  );
}
