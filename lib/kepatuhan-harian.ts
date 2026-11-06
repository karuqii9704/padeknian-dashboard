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

/** Agregat catatan satu pegawai pada satu tanggal. */
export type AgregatHarian = { userId: string; tanggal: string; jumlah: number; disetujui: number; berbukti: number };

/**
 * Pemantauan per hari kerja yang sudah berjalan, dari agregat (pegawai, tanggal): berapa pegawai wajib
 * lapor yang mengisi minimal satu catatan, serta jumlah catatan, yang disetujui, dan yang berbukti.
 * Hari kerja tanpa pengisi tetap muncul (0%); hari libur/akhir pekan dan hari yang belum tiba tidak dihitung.
 */
export function hitungKepatuhanDariAgregat(
  hariKerja: string[],
  sampai: string,
  baris: AgregatHarian[],
  wajibIds: ReadonlySet<string>,
): HariKepatuhan[] {
  const perHari = new Map<string, { pengisi: Set<string>; catatan: number; disetujui: number; berbukti: number }>();
  for (const b of baris) {
    if (!wajibIds.has(b.userId) || b.jumlah <= 0) continue;
    const h = perHari.get(b.tanggal) ?? { pengisi: new Set<string>(), catatan: 0, disetujui: 0, berbukti: 0 };
    h.pengisi.add(b.userId);
    h.catatan += b.jumlah;
    h.disetujui += b.disetujui;
    h.berbukti += b.berbukti;
    perHari.set(b.tanggal, h);
  }
  const wajib = wajibIds.size;
  return hariKerja
    .filter((t) => t <= sampai)
    .map((tanggal) => {
      const h = perHari.get(tanggal);
      const n = h?.pengisi.size ?? 0;
      return {
        tanggal,
        pengisi: n,
        wajib,
        persen: wajib ? Math.round((n / wajib) * 1000) / 10 : null,
        catatan: h?.catatan ?? 0,
        disetujui: h?.disetujui ?? 0,
        berbukti: h?.berbukti ?? 0,
      };
    });
}

/** Sama seperti {@link hitungKepatuhanDariAgregat}, dari daftar catatan satu per satu. */
export function hitungKepatuhanHarian(
  hariKerja: string[],
  sampai: string,
  entri: EntriHarian[],
  wajibIds: ReadonlySet<string>,
): HariKepatuhan[] {
  return hitungKepatuhanDariAgregat(
    hariKerja,
    sampai,
    entri.map((e) => ({ userId: e.userId, tanggal: e.tanggal, jumlah: 1, disetujui: e.statusVerifikasi === "DISETUJUI" ? 1 : 0, berbukti: e.adaBukti ? 1 : 0 })),
    wajibIds,
  );
}

/** Rata-rata persen kepatuhan harian (null bila belum ada hari kerja berjalan). */
export function rataKepatuhan(hari: HariKepatuhan[]) {
  const ada = hari.filter((h) => h.persen !== null);
  if (ada.length === 0) return null;
  return Math.round((ada.reduce((a, h) => a + (h.persen ?? 0), 0) / ada.length) * 10) / 10;
}
