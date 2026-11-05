// Murni (tanpa DB) agar mudah diuji dan aman diimpor dari client.

export type HariKepatuhan = {
  tanggal: string;
  /** Pegawai wajib lapor yang mengisi minimal satu catatan pada hari itu. */
  pengisi: number;
  wajib: number;
  /** Persen kepatuhan pengisian (pengisi / wajib). */
  persen: number | null;
  /** Catatan pegawai wajib lapor bertanggal hari itu, beserta yang sudah disetujui dan yang berbukti. */
  catatan: number;
  disetujui: number;
  berbukti: number;
};

export type EntriHarian = { userId: string; tanggal: string; statusVerifikasi?: string; adaBukti?: boolean };

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
  entri: EntriHarian[],
  wajibIds: ReadonlySet<string>,
): HariKepatuhan[] {
  const pengisi = new Map<string, Set<string>>();
  const hitung = new Map<string, { catatan: number; disetujui: number; berbukti: number }>();
  for (const e of entri) {
    if (!wajibIds.has(e.userId)) continue;
    const s = pengisi.get(e.tanggal) ?? new Set<string>();
    s.add(e.userId);
    pengisi.set(e.tanggal, s);
    const h = hitung.get(e.tanggal) ?? { catatan: 0, disetujui: 0, berbukti: 0 };
    h.catatan += 1;
    if (e.statusVerifikasi === "DISETUJUI") h.disetujui += 1;
    if (e.adaBukti) h.berbukti += 1;
    hitung.set(e.tanggal, h);
  }
  const wajib = wajibIds.size;
  return hariKerja
    .filter((t) => t <= sampai)
    .map((tanggal) => {
      const n = pengisi.get(tanggal)?.size ?? 0;
      const h = hitung.get(tanggal) ?? { catatan: 0, disetujui: 0, berbukti: 0 };
      return { tanggal, pengisi: n, wajib, persen: wajib ? Math.round((n / wajib) * 1000) / 10 : null, ...h };
    });
}

/** Rata-rata persen kepatuhan harian (null bila belum ada hari kerja berjalan). */
export function rataKepatuhan(hari: HariKepatuhan[]) {
  const ada = hari.filter((h) => h.persen !== null);
  if (ada.length === 0) return null;
  return Math.round((ada.reduce((a, h) => a + (h.persen ?? 0), 0) / ada.length) * 10) / 10;
}
