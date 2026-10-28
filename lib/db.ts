import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Di Vercel tiap instance hanya diberi 1 koneksi lewat DATABASE_URL, sehingga halaman yang dimuat paralel
 * (prefetch menu) saling antre sampai habis waktu (P2024). Beri ruang beberapa koneksi dan waktu tunggu lebih longgar.
 */
function datasourceUrl() {
  const url = process.env.DATABASE_URL;
  if (!url || !process.env.VERCEL) return undefined;
  const u = new URL(url);
  u.searchParams.set("connection_limit", "5");
  u.searchParams.set("pool_timeout", "20");
  return u.toString();
}

export const db = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: datasourceUrl() });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
