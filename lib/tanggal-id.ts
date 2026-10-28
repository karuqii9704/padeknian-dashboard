const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "2026-10-14" -> "Rabu, 14 Okt 2026" (tanpa pengaruh zona waktu). */
export function labelTanggal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const hari = HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${hari}, ${d} ${BULAN_PENDEK[m - 1]} ${y}`;
}

/** "2026-10-14" -> "14 Okt". */
export function tanggalSingkat(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN_PENDEK[m - 1]}`;
}
