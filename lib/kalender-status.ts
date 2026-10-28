import { formatTanggal, isAkhirPekan } from "@/lib/kalender";

export type StatusHari = "KOSONG" | "MENUNGGU" | "DISETUJUI" | "REVISI";

/**
 * Status satu hari kerja dari status verifikasi seluruh entri hari itu.
 * Prioritas: perlu revisi > menunggu verifikasi > disetujui > tidak ada entri.
 * DITOLAK diperlakukan sama dengan revisi (perlu tindakan pegawai).
 */
export function statusHari(statusVerifikasi: readonly string[]): StatusHari {
  if (statusVerifikasi.some((s) => s === "MINTA_REVISI" || s === "DITOLAK")) return "REVISI";
  if (statusVerifikasi.includes("MENUNGGU")) return "MENUNGGU";
  if (statusVerifikasi.includes("DISETUJUI")) return "DISETUJUI";
  return "KOSONG";
}

export type HariKalender = {
  tanggal: string;
  hariKerja: boolean;
  libur: string | null;
  akhirPekan: boolean;
  status: StatusHari | null; // null = bukan hari kerja
  jumlah: number;
};

/** Susun seluruh hari dalam periode untuk tampilan kalender. */
export function susunKalender(
  mulai: Date,
  selesai: Date,
  libur: ReadonlyMap<string, string>,
  entri: { tanggal: string; statusVerifikasi: string }[],
): HariKalender[] {
  const perHari = new Map<string, string[]>();
  for (const e of entri) perHari.set(e.tanggal, [...(perHari.get(e.tanggal) ?? []), e.statusVerifikasi]);

  const hasil: HariKalender[] = [];
  for (let t = mulai.getTime(); t <= selesai.getTime(); t += 86_400_000) {
    const d = new Date(t);
    const tanggal = formatTanggal(d);
    const akhirPekan = isAkhirPekan(d);
    const ket = libur.get(tanggal) ?? null;
    const hariKerja = !akhirPekan && ket === null;
    const list = perHari.get(tanggal) ?? [];
    hasil.push({
      tanggal,
      hariKerja,
      libur: ket,
      akhirPekan,
      // Hari non-kerja yang punya entri (mis. data lama) tetap menampilkan statusnya.
      status: hariKerja || list.length ? statusHari(list) : null,
      jumlah: list.length,
    });
  }
  return hasil;
}
