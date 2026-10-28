// Semua tanggal diperlakukan sebagai "YYYY-MM-DD" (tanpa zona waktu) / UTC midnight.

export function formatTanggal(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function rentangBulan(tahun: number, bulan: number) {
  const mulai = new Date(Date.UTC(tahun, bulan - 1, 1));
  const selesai = new Date(Date.UTC(tahun, bulan, 0)); // hari 0 bulan berikutnya = hari terakhir bulan ini
  return { mulai, selesai };
}

export function isAkhirPekan(d: Date) {
  const hari = d.getUTCDay();
  return hari === 0 || hari === 6;
}

/** Senin–Jumat dalam [mulai, selesai] dikurangi hari libur. Mengembalikan daftar "YYYY-MM-DD". */
export function hariKerjaEfektif(mulai: Date, selesai: Date, libur: Iterable<string>) {
  const liburSet = new Set(libur);
  const hasil: string[] = [];
  for (let t = mulai.getTime(); t <= selesai.getTime(); t += 86_400_000) {
    const d = new Date(t);
    const s = formatTanggal(d);
    if (!isAkhirPekan(d) && !liburSet.has(s)) hasil.push(s);
  }
  return hasil;
}
