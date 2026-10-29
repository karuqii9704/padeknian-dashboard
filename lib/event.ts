import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { hariIni } from "@/lib/clock";
import { formatTanggal } from "@/lib/kalender";
import { logger } from "@/lib/logger";
import { cariPeriode } from "@/lib/pekerjaan";
import { pasanganKetua } from "@/lib/verifikasi";
import { deleteObject } from "@/lib/storage";
import { bentukLampiranEvent } from "@/lib/event-bentuk";
import type { buatEventSchema, listEventQuery, ubahEventSchema } from "@/lib/event-schema";
import { HttpError, type SessionUser } from "@/lib/rbac";

export type ServiceError = { ok: false; status: 400 | 403 | 404 | 409; pesan: string };
const fail = (status: ServiceError["status"], pesan: string): ServiceError => ({ ok: false, status, pesan });

const tgl = (s: string) => new Date(`${s}T00:00:00Z`);

export const eventInclude = {
  user: { select: { id: true, nama: true, nip: true } },
  periode: { select: { status: true, tahun: true, bulan: true } },
  lampiran: { orderBy: { uploadedAt: "asc" as const } },
} satisfies Prisma.EventInclude;

type EventLengkap = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

export function bentukEvent(e: EventLengkap) {
  return {
    id: e.id,
    pelapor: e.user,
    periodeId: e.periodeId,
    periodeDikunci: e.periode.status === "DIKUNCI",
    judul: e.judul,
    jenis: e.jenis,
    tanggalMulai: formatTanggal(e.tanggalMulai),
    tanggalSelesai: formatTanggal(e.tanggalSelesai),
    lokasi: e.lokasi,
    peran: e.peran,
    uraianHasil: e.uraianHasil,
    lampiran: e.lampiran.map(bentukLampiranEvent),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** Event dilaporkan setelah (atau saat) terjadi: tanggal mulai tidak boleh di masa depan. */
function cekTidakMasaDepan(tanggalMulai: string) {
  return tanggalMulai > hariIni() ? fail(400, "Tanggal mulai tidak boleh di masa depan.") : null;
}

/** Periode yang memuat tanggal mulai harus ada dan belum dikunci. */
async function periodeUntuk(tanggalMulai: string) {
  const p = await cariPeriode(tanggalMulai);
  if (!p.ok) return p;
  if (p.periode.status === "DIKUNCI") return fail(409, "Periode sudah dikunci; event tidak dapat ditambahkan atau diubah.");
  return p;
}

export async function buatEvent(user: SessionUser, input: z.infer<typeof buatEventSchema>) {
  const masaDepan = cekTidakMasaDepan(input.tanggalMulai);
  if (masaDepan) return masaDepan;
  const p = await periodeUntuk(input.tanggalMulai);
  if (!p.ok) return p;

  const e = await db.event.create({
    data: {
      userId: user.id,
      periodeId: p.periode.id,
      judul: input.judul,
      jenis: input.jenis,
      tanggalMulai: tgl(input.tanggalMulai),
      tanggalSelesai: tgl(input.tanggalSelesai),
      lokasi: input.lokasi,
      peran: input.peran,
      uraianHasil: input.uraianHasil,
    },
    include: eventInclude,
  });
  return { ok: true as const, event: bentukEvent(e) };
}

/** Siapa boleh melihat event: pemilik, atau ketua tim pemilik pada periode event itu. */
export async function bolehLihatEvent(user: SessionUser, e: { userId: string; periodeId: string }) {
  if (e.userId === user.id) return true;
  if (user.role !== "KETUA_TIM") return false;
  const n = await db.anggotaTim.count({ where: { userId: e.userId, periodeId: e.periodeId, tim: { ketuaId: user.id } } });
  return n > 0;
}

export async function daftarEvent(user: SessionUser, q: z.infer<typeof listEventQuery>) {
  const and: Prisma.EventWhereInput[] = [];
  if (q.cakupan === "tim") {
    if (user.role !== "KETUA_TIM") throw new HttpError(403, "Event tim hanya dapat dilihat oleh ketua tim.");
    const pasangan = (await pasanganKetua(user.id)).filter((p) => !q.userId || p.userId === q.userId);
    if (pasangan.length === 0) return { data: [], total: 0, page: q.page, pageSize: q.pageSize };
    and.push({ OR: pasangan.map((p) => ({ userId: p.userId, periodeId: p.periodeId })) });
  } else {
    if (q.userId && q.userId !== user.id) throw new HttpError(403, "Anda hanya dapat melihat event milik Anda sendiri.");
    and.push({ userId: user.id });
  }
  if (q.periodeId) and.push({ periodeId: q.periodeId });
  if (q.jenis) and.push({ jenis: q.jenis });
  const where: Prisma.EventWhereInput = { AND: and };

  const [rows, total] = await Promise.all([
    db.event.findMany({
      where,
      include: eventInclude,
      orderBy: [{ tanggalMulai: "desc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.event.count({ where }),
  ]);
  return { data: rows.map(bentukEvent), total, page: q.page, pageSize: q.pageSize };
}

export async function detailEvent(user: SessionUser, id: string) {
  const e = await db.event.findUnique({ where: { id }, include: eventInclude });
  if (!e || !(await bolehLihatEvent(user, e))) return fail(404, "Event tidak ditemukan.");
  return { ok: true as const, event: bentukEvent(e) };
}

/** Hanya pemilik, dan hanya selama periode event belum dikunci. */
export async function muatEventUntukUbah(user: SessionUser, id: string) {
  const e = await db.event.findUnique({ where: { id }, include: eventInclude });
  if (!e) throw new HttpError(404, "Event tidak ditemukan.");
  if (e.userId !== user.id) throw new HttpError(403, "Anda hanya dapat mengubah event milik Anda sendiri.");
  if (e.periode.status === "DIKUNCI") throw new HttpError(409, "Periode sudah dikunci; event tidak dapat diubah atau dihapus.");
  return e;
}

export async function ubahEvent(user: SessionUser, id: string, input: z.infer<typeof ubahEventSchema>) {
  const e = await muatEventUntukUbah(user, id);
  const mulai = input.tanggalMulai ?? formatTanggal(e.tanggalMulai);
  const selesai = input.tanggalSelesai ?? formatTanggal(e.tanggalSelesai);
  if (selesai < mulai) return fail(400, "Tanggal selesai tidak boleh sebelum tanggal mulai.");

  // Periode dicari ulang hanya bila tanggal mulai berubah.
  let periodeId = e.periodeId;
  if (input.tanggalMulai && input.tanggalMulai !== formatTanggal(e.tanggalMulai)) {
    const masaDepan = cekTidakMasaDepan(input.tanggalMulai);
    if (masaDepan) return masaDepan;
    const p = await periodeUntuk(input.tanggalMulai);
    if (!p.ok) return p;
    periodeId = p.periode.id;
  }

  const baru = await db.event.update({
    where: { id },
    data: {
      periodeId,
      ...(input.judul !== undefined ? { judul: input.judul } : {}),
      ...(input.jenis !== undefined ? { jenis: input.jenis } : {}),
      ...(input.tanggalMulai !== undefined ? { tanggalMulai: tgl(input.tanggalMulai) } : {}),
      ...(input.tanggalSelesai !== undefined ? { tanggalSelesai: tgl(input.tanggalSelesai) } : {}),
      ...(input.lokasi !== undefined ? { lokasi: input.lokasi } : {}),
      ...(input.peran !== undefined ? { peran: input.peran } : {}),
      ...(input.uraianHasil !== undefined ? { uraianHasil: input.uraianHasil } : {}),
    },
    include: eventInclude,
  });
  return { ok: true as const, event: bentukEvent(baru) };
}

export async function hapusEvent(user: SessionUser, id: string, ip: string | null) {
  const e = await muatEventUntukUbah(user, id);
  const kunci = e.lampiran.map((l) => l.objectKey);
  await db.event.delete({ where: { id } }); // lampiran ikut terhapus (cascade)
  // Objek storage dibersihkan setelah DB berubah; kegagalan dicatat, tidak menggagalkan permintaan.
  for (const objectKey of kunci) {
    await deleteObject(objectKey).catch((err) => logger.error({ err, objectKey }, "gagal menghapus lampiran event dari storage (yatim)"));
  }
  await tulisAudit({
    userId: user.id,
    aksi: "HAPUS_EVENT",
    entitas: "Event",
    entitasId: id,
    metadata: { judul: e.judul, tanggalMulai: formatTanggal(e.tanggalMulai), jumlahLampiran: kunci.length },
    ipAddress: ip,
  });
  return { ok: true as const };
}
