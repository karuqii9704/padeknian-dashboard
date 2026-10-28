/** Persentase capaian (1 desimal). Target <= 0 -> 0. Boleh > 100. */
export function persen(realisasi: number, target: number) {
  return target > 0 ? Math.round((realisasi / target) * 1000) / 10 : 0;
}

export type Agregat = { realisasi: number; menunggu: number };

/** Gabungkan baris groupBy (penugasanId, statusVerifikasi, sum volume) menjadi peta per penugasan. */
export function susunAgregat(
  rows: { penugasanId: string | null; statusVerifikasi: string; volume: number }[],
): Map<string, Agregat> {
  const m = new Map<string, Agregat>();
  for (const r of rows) {
    if (!r.penugasanId) continue;
    const a = m.get(r.penugasanId) ?? { realisasi: 0, menunggu: 0 };
    if (r.statusVerifikasi === "DISETUJUI") a.realisasi += r.volume;
    else if (r.statusVerifikasi === "MENUNGGU") a.menunggu += r.volume;
    m.set(r.penugasanId, a);
  }
  return m;
}

/** Persentase 1 desimal; pembagi 0 -> null (belum ada data, bukan 0 atau NaN). */
export function persenAtauNull(bagian: number, total: number) {
  return total > 0 ? Math.round((bagian / total) * 1000) / 10 : null;
}
