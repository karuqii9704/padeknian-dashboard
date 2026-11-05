import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { hariIni } from "@/lib/clock";
import { formatTanggal } from "@/lib/kalender";
import { buatNotifikasi } from "@/lib/notify";
import { hariKerja, hariKerjaSebelumnya } from "@/lib/pengingat-hari";
import { labelTanggal } from "@/lib/tanggal-id";

export type HasilPengingat =
  | { dikirim: true; tanggal: string; jumlah: number; sudahAda: number }
  | { dikirim: false; alasan: string; tanggal?: string };

const tgl = (s: string) => new Date(`${s}T00:00:00Z`);

/**
 * Pengingat harian (PRD Fase 4): notifikasi in-app untuk pegawai yang belum mencatat pekerjaan pada
 * hari kerja sebelumnya. Hanya berjalan pada hari kerja, hanya untuk periode AKTIF, dan hanya untuk
 * akun aktif yang tergabung dalam tim pada periode itu (anggota atau ketua tim aktif).
 * Idempoten: menjalankan ulang pada hari yang sama tidak mengirim notifikasi ganda.
 */
export async function kirimPengingatHarian(opts: { sekarang?: string; actorId?: string | null; ip?: string | null } = {}): Promise<HasilPengingat> {
  const sekarang = opts.sekarang ?? hariIni();
  const liburRows = await db.hariLibur.findMany({
    where: { tanggal: { gte: new Date(tgl(sekarang).getTime() - 21 * 86_400_000), lte: tgl(sekarang) } },
    select: { tanggal: true },
  });
  const libur = new Set(liburRows.map((l) => formatTanggal(l.tanggal)));

  if (!hariKerja(sekarang, libur)) return { dikirim: false, alasan: "Hari ini bukan hari kerja; pengingat tidak dikirim." };
  const sasaran = hariKerjaSebelumnya(sekarang, libur);
  if (!sasaran) return { dikirim: false, alasan: "Tidak ada hari kerja sebelumnya dalam 14 hari terakhir." };

  const periode = await db.periode.findFirst({ where: { tanggalMulai: { lte: tgl(sasaran) }, tanggalSelesai: { gte: tgl(sasaran) } } });
  if (!periode || periode.status !== "AKTIF") {
    return { dikirim: false, alasan: "Tanggal sasaran tidak berada dalam periode aktif.", tanggal: sasaran };
  }

  // Wajib lapor: anggota tim aktif pada periode itu + ketua tim aktif; akun aktif berperan Pegawai/Ketua Tim.
  const [anggota, ketua] = await Promise.all([
    db.anggotaTim.findMany({ where: { periodeId: periode.id, tim: { isActive: true } }, select: { userId: true } }),
    db.timKerja.findMany({ where: { isActive: true }, select: { ketuaId: true } }),
  ]);
  const kandidat = [...new Set([...anggota.map((a) => a.userId), ...ketua.map((k) => k.ketuaId)])];
  const [aktif, sudahIsi, sudahDiingatkan] = await Promise.all([
    db.user.findMany({ where: { id: { in: kandidat }, isActive: true, role: { in: ["PEGAWAI", "KETUA_TIM"] } }, select: { id: true } }),
    db.pekerjaanHarian.findMany({ where: { tanggal: tgl(sasaran), userId: { in: kandidat } }, select: { userId: true }, distinct: ["userId"] }),
    db.notifikasi.findMany({ where: { tipe: "PENGINGAT_HARIAN", link: tautanPengingat(sasaran), userId: { in: kandidat } }, select: { userId: true } }),
  ]);
  const isi = new Set(sudahIsi.map((e) => e.userId));
  const diingatkan = new Set(sudahDiingatkan.map((n) => n.userId));
  const target = aktif.map((u) => u.id).filter((id) => !isi.has(id) && !diingatkan.has(id));

  await buatNotifikasi(
    db,
    target.map((userId) => ({
      userId,
      tipe: "PENGINGAT_HARIAN" as const,
      judul: "Catatan pekerjaan belum diisi",
      isi: `Anda belum mencatat pekerjaan pada ${labelTanggal(sasaran)}. Catatan susulan masih dapat diisi paling lambat 3 hari setelahnya.`,
      link: tautanPengingat(sasaran),
    })),
  );
  await tulisAudit({
    userId: opts.actorId ?? null,
    aksi: "KIRIM_PENGINGAT",
    entitas: "Notifikasi",
    metadata: { tanggalSasaran: sasaran, dikirim: target.length, sudahAda: diingatkan.size, sudahIsi: isi.size },
    ipAddress: opts.ip ?? null,
  });
  return { dikirim: true, tanggal: sasaran, jumlah: target.length, sudahAda: diingatkan.size };
}

/** Tautan notifikasi; juga kunci idempotensi per tanggal sasaran. */
export function tautanPengingat(tanggal: string) {
  return `/hari-ini?catat=1&tanggal=${tanggal}`;
}
