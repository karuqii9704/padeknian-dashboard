/**
 * Geser tanggal "YYYY-MM-DD" ke bulan/tahun target dengan mempertahankan tanggal (hari dalam bulan).
 * Bila hari tidak ada di bulan target (mis. 31 -> Februari), dipotong ke hari terakhir bulan itu.
 */
export function geserTanggal(iso: string, tahun: number, bulan: number) {
  const hari = Number(iso.slice(8, 10));
  const hariTerakhir = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  const d = Math.min(hari, hariTerakhir);
  return `${tahun}-${String(bulan).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Periode sebelumnya dari (tahun, bulan). */
export function bulanSebelumnya(tahun: number, bulan: number) {
  return bulan === 1 ? { tahun: tahun - 1, bulan: 12 } : { tahun, bulan: bulan - 1 };
}
