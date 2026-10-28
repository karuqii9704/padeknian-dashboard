import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

export type AuditInput = {
  userId?: string | null;
  aksi: string;
  entitas: string;
  entitasId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

type Client = Pick<PrismaClient, "auditLog">;

/**
 * Satu-satunya jalur tulis AuditLog. Hanya create: tidak ada update/delete
 * (juga diblokir trigger di database).
 */
export async function tulisAudit(input: AuditInput, client: Client = db) {
  return client.auditLog.create({
    data: {
      userId: input.userId ?? null,
      aksi: input.aksi,
      entitas: input.entitas,
      entitasId: input.entitasId ?? null,
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
