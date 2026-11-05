// Murni (tanpa DB) agar mudah diuji dan aman diimpor dari client.

export type HariKepatuhan = { tanggal: string; pengisi: number; wajib: number; persen: number | null };

/** Acuan kepatuhan yang sama dengan pewarnaan kelengkapan per pegawai. */
export const ACUAN_BAIK = 80;
export const ACUAN_CUKUP = 50;

/**
 * Kepatuhan pengisian per hari kerja yang sudah berjalan: berapa dari pegawai wajib lapor yang
 * mencatat minimal satu pekerjaan pada hari itu. Hari kerja tanpa pengisi tetap muncul (0%);
 * hari libur/akhir pekan dan hari yang belum tiba tidak dihitung.
 */
export function hitungKepatuhanHarian(
  hariKerja: string[],
  sampai: string,
  entri: { userId: string; tanggal: string }[],
  wajibIds: ReadonlySet<string>,
): HariKepatuhan[] {
  const pengisi = new Map<string, Set<string>>();
  for (const e of entri) {
    if (!wajibIds.has(e.userId)) continue;
    const s = pengisi.get(e.tanggal) ?? new Set<string>();
    s.add(e.userId);
    pengisi.set(e.tanggal, s);
  }
  const wajib = wajibIds.size;
  return hariKerja
    .filter((t) => t <= sampai)
    .map((tanggal) => {
      const n = pengisi.get(tanggal)?.size ?? 0;
      return { tanggal, pengisi: n, wajib, persen: wajib ? Math.round((n / wajib) * 1000) / 10 : null };
    });
}

/** Rata-rata persen kepatuhan harian (null bila belum ada hari kerja berjalan). */
export function rataKepatuhan(hari: HariKepatuhan[]) {
  const ada = hari.filter((h) => h.persen !== null);
  if (ada.length === 0) return null;
  return Math.round((ada.reduce((a, h) => a + (h.persen ?? 0), 0) / ada.length) * 10) / 10;
}
