const PRIO: Record<string, number> = { TINGGI: 0, SEDANG: 1, RENDAH: 2 };

type Urutable = { prioritas: string; tanggalSelesai: string; judul: string };

/** Prioritas TINGGI dulu, lalu deadline terdekat, lalu judul. Tidak mengubah array asal. */
export function urutkanAlokasi<T extends Urutable>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (PRIO[a.prioritas] ?? 9) - (PRIO[b.prioritas] ?? 9) ||
      a.tanggalSelesai.localeCompare(b.tanggalSelesai) ||
      a.judul.localeCompare(b.judul),
  );
}

/** Sisa target untuk default volume: target - (disetujui + menunggu), minimal 1. */
export function sisaTarget(target: number, realisasi: number, menunggu: number) {
  const sisa = Math.round((target - realisasi - menunggu) * 100) / 100;
  return sisa > 0 ? sisa : 1;
}
