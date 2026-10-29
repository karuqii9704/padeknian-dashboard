export type Aktivitas = {
  tipe: "pekerjaan" | "event";
  id: string;
  judul: string;
  /** YYYY-MM-DD */
  tanggal: string;
  /** Hanya untuk pekerjaan: status verifikasi. */
  status?: string;
  href: string;
  /** ISO, hanya untuk memutus seri pada tanggal yang sama. */
  dibuat: string;
};

export const BATAS_AKTIVITAS = 5;

/** Gabungkan pekerjaan dan event, terbaru dulu (tanggal, lalu waktu dibuat), maksimal `batas` item. */
export function gabungkanAktivitas(pekerjaan: Aktivitas[], event: Aktivitas[], batas = BATAS_AKTIVITAS): Aktivitas[] {
  return [...pekerjaan, ...event]
    .sort((a, b) => (a.tanggal === b.tanggal ? b.dibuat.localeCompare(a.dibuat) : b.tanggal.localeCompare(a.tanggal)))
    .slice(0, batas);
}
