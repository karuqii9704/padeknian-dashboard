import type { PrismaClient } from "@prisma/client";
import { buatPrisma } from "@/lib/prisma-klien";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Di Vercel tiap instance hanya diberi sedikit koneksi, sehingga halaman yang dimuat paralel (prefetch menu)
 * saling antre. Beri pool kecil dengan waktu tunggu lebih longgar; selain itu pool 10 koneksi.
 */
function buatDb() {
  return process.env.VERCEL ? buatPrisma({ max: 5, connectionTimeoutMillis: 20_000 }) : buatPrisma({ max: 10 });
}

export const db = globalForPrisma.prisma ?? buatDb();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
