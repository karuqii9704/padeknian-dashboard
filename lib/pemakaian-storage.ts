import { db } from "@/lib/db";

/**
 * Pemakaian object storage per periode, dihitung dari metadata di database (ukuran tercatat saat unggah):
 * bukti dukung catatan harian + lampiran event. Berkas rekap (XLSX/PDF/ZIP) tidak tercatat ukurannya
 * sehingga tidak ikut dihitung. Kuota opsional dari env STORAGE_KUOTA_GB (mis. 10 untuk R2 gratis).
 */
export async function pemakaianStorage() {
  const [bukti, lampiran, periodes] = await Promise.all([
    db.$queryRaw<{ periode_id: string; jumlah: bigint; bytes: bigint | null }[]>`
      SELECT ph."periode_id", COUNT(b.*) AS jumlah, SUM(b."ukuran_bytes") AS bytes
      FROM "BuktiDukung" b JOIN "PekerjaanHarian" ph ON ph."id" = b."pekerjaan_harian_id"
      GROUP BY ph."periode_id"`,
    db.$queryRaw<{ periode_id: string; jumlah: bigint; bytes: bigint | null }[]>`
      SELECT e."periode_id", COUNT(l.*) AS jumlah, SUM(l."ukuran_bytes") AS bytes
      FROM "EventLampiran" l JOIN "Event" e ON e."id" = l."event_id"
      GROUP BY e."periode_id"`,
    db.periode.findMany({ select: { id: true, tahun: true, bulan: true, status: true }, orderBy: [{ tahun: "desc" }, { bulan: "desc" }] }),
  ]);
  const peta = (rows: typeof bukti) => new Map(rows.map((r) => [r.periode_id, { jumlah: Number(r.jumlah), bytes: Number(r.bytes ?? 0) }]));
  const b = peta(bukti);
  const l = peta(lampiran);
  const perPeriode = periodes
    .map((p) => {
      const x = b.get(p.id) ?? { jumlah: 0, bytes: 0 };
      const y = l.get(p.id) ?? { jumlah: 0, bytes: 0 };
      return { ...p, bukti: x, lampiran: y, totalBytes: x.bytes + y.bytes };
    })
    .filter((p) => p.bukti.jumlah + p.lampiran.jumlah > 0);
  const totalBytes = perPeriode.reduce((a, p) => a + p.totalBytes, 0);
  const kuotaGb = Number(process.env.STORAGE_KUOTA_GB);
  return {
    totalBytes,
    jumlahBerkas: perPeriode.reduce((a, p) => a + p.bukti.jumlah + p.lampiran.jumlah, 0),
    kuotaBytes: Number.isFinite(kuotaGb) && kuotaGb > 0 ? kuotaGb * 1024 ** 3 : null,
    perPeriode,
  };
}

export type PemakaianStorage = Awaited<ReturnType<typeof pemakaianStorage>>;
