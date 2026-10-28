import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { formatTanggal, hariKerjaEfektif, rentangBulan } from "@/lib/kalender";

export type ServiceError = { ok: false; status: 400 | 404 | 409; pesan: string };
const fail = (status: ServiceError["status"], pesan: string): ServiceError => ({ ok: false, status, pesan });

export const buatPeriodeSchema = z.object({
  tahun: z.number().int("Tahun harus bilangan bulat.").min(2000, "Tahun tidak valid.").max(2100, "Tahun tidak valid."),
  bulan: z.number().int("Bulan harus bilangan bulat.").min(1, "Bulan harus 1-12.").max(12, "Bulan harus 1-12."),
});

export { tanggalSchema } from "@/lib/schemas";
import { tanggalSchema } from "@/lib/schemas";

export const buatHariLiburSchema = z.object({
  tanggal: tanggalSchema,
  keterangan: z.string().trim().min(1, "Keterangan wajib diisi.").max(160, "Keterangan maksimal 160 karakter."),
  jenis: z.enum(["LIBUR_NASIONAL", "CUTI_BERSAMA", "LIBUR_LAIN"], { message: "Jenis hari libur tidak valid." }),
});

type Tx = Prisma.TransactionClient | typeof db;

async function liburDalam(client: Tx, mulai: Date, selesai: Date) {
  const rows = await client.hariLibur.findMany({
    where: { tanggal: { gte: mulai, lte: selesai } },
    select: { tanggal: true },
  });
  return rows.map((r) => formatTanggal(r.tanggal));
}

export async function daftarHariKerja(periodeId: string) {
  const p = await db.periode.findUnique({ where: { id: periodeId } });
  if (!p) return fail(404, "Periode tidak ditemukan.");
  const tanggal = hariKerjaEfektif(p.tanggalMulai, p.tanggalSelesai, await liburDalam(db, p.tanggalMulai, p.tanggalSelesai));
  return { ok: true as const, periodeId: p.id, jumlah: tanggal.length, tanggal };
}

/** Hitung ulang jumlah_hari_kerja periode (non-DIKUNCI) yang memuat tanggal tertentu. */
export async function hitungUlangPeriodeUntukTanggal(client: Tx, tanggal: Date) {
  const periodes = await client.periode.findMany({
    where: { tanggalMulai: { lte: tanggal }, tanggalSelesai: { gte: tanggal }, status: { not: "DIKUNCI" } },
  });
  for (const p of periodes) {
    const jumlah = hariKerjaEfektif(p.tanggalMulai, p.tanggalSelesai, await liburDalam(client, p.tanggalMulai, p.tanggalSelesai)).length;
    if (jumlah !== p.jumlahHariKerja) await client.periode.update({ where: { id: p.id }, data: { jumlahHariKerja: jumlah } });
  }
}

export async function buatPeriode(actorId: string, input: z.infer<typeof buatPeriodeSchema>, ip: string | null) {
  const ada = await db.periode.findUnique({ where: { tahun_bulan: { tahun: input.tahun, bulan: input.bulan } } });
  if (ada) return fail(409, "Periode untuk bulan dan tahun tersebut sudah ada.");
  const { mulai, selesai } = rentangBulan(input.tahun, input.bulan);
  const jumlah = hariKerjaEfektif(mulai, selesai, await liburDalam(db, mulai, selesai)).length;
  const periode = await db.periode.create({
    data: { tahun: input.tahun, bulan: input.bulan, tanggalMulai: mulai, tanggalSelesai: selesai, jumlahHariKerja: jumlah },
  });
  await tulisAudit({
    userId: actorId,
    aksi: "BUAT_PERIODE",
    entitas: "Periode",
    entitasId: periode.id,
    metadata: { tahun: periode.tahun, bulan: periode.bulan, jumlahHariKerja: jumlah },
    ipAddress: ip,
  });
  return { ok: true as const, periode };
}

export async function aktifkanPeriode(actorId: string, id: string, ip: string | null) {
  const target = await db.periode.findUnique({ where: { id } });
  if (!target) return fail(404, "Periode tidak ditemukan.");
  if (target.status === "DIKUNCI") return fail(409, "Periode yang sudah dikunci tidak dapat diaktifkan kembali.");
  if (target.status === "AKTIF") return { ok: true as const, periode: target, diturunkan: null };

  const diturunkan = await db.periode.findFirst({ where: { status: "AKTIF" }, select: { id: true, tahun: true, bulan: true } });
  const periode = await db.$transaction(async (tx) => {
    // Urutan penting: turunkan dulu, agar indeks unik "satu AKTIF" tidak bentrok.
    await tx.periode.updateMany({ where: { status: "AKTIF" }, data: { status: "DRAFT" } });
    return tx.periode.update({ where: { id }, data: { status: "AKTIF" } });
  });
  await tulisAudit({
    userId: actorId,
    aksi: "AKTIFKAN_PERIODE",
    entitas: "Periode",
    entitasId: id,
    metadata: { sebelum: { status: target.status }, sesudah: { status: "AKTIF" }, periodeDiturunkan: diturunkan },
    ipAddress: ip,
  });
  return { ok: true as const, periode, diturunkan };
}

export async function daftarHariLibur(tahun?: number) {
  return db.hariLibur.findMany({
    where: tahun ? { tanggal: { gte: new Date(Date.UTC(tahun, 0, 1)), lte: new Date(Date.UTC(tahun, 11, 31)) } } : {},
    orderBy: { tanggal: "asc" },
  });
}

export async function tambahHariLibur(actorId: string, input: z.infer<typeof buatHariLiburSchema>, ip: string | null) {
  const tanggal = new Date(`${input.tanggal}T00:00:00Z`);
  if (await db.hariLibur.findUnique({ where: { tanggal } })) return fail(409, "Hari libur pada tanggal tersebut sudah ada.");
  const libur = await db.$transaction(async (tx) => {
    const created = await tx.hariLibur.create({ data: { tanggal, keterangan: input.keterangan, jenis: input.jenis } });
    await hitungUlangPeriodeUntukTanggal(tx, tanggal);
    return created;
  });
  await tulisAudit({
    userId: actorId,
    aksi: "TAMBAH_HARI_LIBUR",
    entitas: "HariLibur",
    entitasId: libur.id,
    metadata: { tanggal: input.tanggal, keterangan: input.keterangan, jenis: input.jenis },
    ipAddress: ip,
  });
  return { ok: true as const, libur };
}

export async function hapusHariLibur(actorId: string, id: string, ip: string | null) {
  const libur = await db.hariLibur.findUnique({ where: { id } });
  if (!libur) return fail(404, "Hari libur tidak ditemukan.");
  await db.$transaction(async (tx) => {
    await tx.hariLibur.delete({ where: { id } });
    await hitungUlangPeriodeUntukTanggal(tx, libur.tanggal);
  });
  await tulisAudit({
    userId: actorId,
    aksi: "HAPUS_HARI_LIBUR",
    entitas: "HariLibur",
    entitasId: id,
    metadata: { tanggal: formatTanggal(libur.tanggal), keterangan: libur.keterangan },
    ipAddress: ip,
  });
  return { ok: true as const };
}
