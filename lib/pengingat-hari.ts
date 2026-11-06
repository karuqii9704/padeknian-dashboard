import { formatTanggal, isAkhirPekan } from "@/lib/kalender";

// Murni (tanpa DB) agar mudah diuji.

const tgl = (s: string) => new Date(`${s}T00:00:00Z`);

/** Apakah tanggal "YYYY-MM-DD" hari kerja (Senin–Jumat dan bukan hari libur). */
export function hariKerja(tanggal: string, libur: ReadonlySet<string>) {
  return !isAkhirPekan(tgl(tanggal)) && !libur.has(tanggal);
}

/**
 * Hari kerja terakhir SEBELUM `hariIni` (melompati akhir pekan dan libur), dicari mundur
 * paling jauh `maksMundur` hari. Null bila tidak ada (mis. libur panjang).
 */
export function hariKerjaSebelumnya(hariIni: string, libur: ReadonlySet<string>, maksMundur = 14): string | null {
  for (let i = 1; i <= maksMundur; i++) {
    const t = formatTanggal(new Date(tgl(hariIni).getTime() - i * 86_400_000));
    if (hariKerja(t, libur)) return t;
  }
  return null;
}
