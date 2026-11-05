import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { tanggalSchema } from "@/lib/schemas";

/** Filter daftar audit log (FR-6, `GET /api/audit-log`). Tanggal dibaca dalam WIB. */
export const auditLogQuery = z
  .object({
    aksi: z.string().trim().regex(/^[A-Z_]{1,80}$/, "Aksi tidak valid.").optional(),
    q: z.string().trim().max(120).optional(),
    dari: tanggalSchema.optional(),
    sampai: tanggalSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((v) => !v.dari || !v.sampai || v.dari <= v.sampai, { message: "Tanggal akhir tidak boleh sebelum tanggal awal." });

export type AuditLogQuery = z.infer<typeof auditLogQuery>;

const awalHariWib = (tgl: string) => new Date(`${tgl}T00:00:00+07:00`);
const SEHARI_MS = 24 * 60 * 60 * 1000;

export function whereAuditLog(q: AuditLogQuery): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (q.aksi) and.push({ aksi: q.aksi });
  if (q.dari) and.push({ createdAt: { gte: awalHariWib(q.dari) } });
  if (q.sampai) and.push({ createdAt: { lt: new Date(awalHariWib(q.sampai).getTime() + SEHARI_MS) } });
  if (q.q) {
    and.push({
      user: { OR: [{ nama: { contains: q.q, mode: "insensitive" } }, { nip: { contains: q.q } }, { email: { contains: q.q, mode: "insensitive" } }] },
    });
  }
  return and.length ? { AND: and } : {};
}

export async function daftarAuditLog(q: AuditLogQuery) {
  const where = whereAuditLog(q);
  const [rows, total, aksi] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { user: { select: { nama: true, nip: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["aksi"], select: { aksi: true }, orderBy: { aksi: "asc" } }),
  ]);
  return {
    data: rows.map((r) => ({
      id: r.id.toString(),
      createdAt: r.createdAt.toISOString(),
      aksi: r.aksi,
      entitas: r.entitas,
      entitasId: r.entitasId,
      metadata: r.metadata,
      ipAddress: r.ipAddress,
      user: r.user,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    aksiTersedia: aksi.map((a) => a.aksi),
  };
}
