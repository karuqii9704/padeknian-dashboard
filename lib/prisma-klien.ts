import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Pabrik Prisma Client (Prisma 7 mewajibkan driver adapter). Dipakai aplikasi, worker, skrip, seed, dan E2E
 * agar konfigurasi koneksi hanya di satu tempat. `max` = ukuran pool koneksi pg.
 */
export function buatPrisma(opts: { url?: string; max?: number; connectionTimeoutMillis?: number } = {}) {
  // Tidak melempar saat dibuat (sama seperti Prisma 6): `next build` dan unit test mengimpor modul ini
  // tanpa DATABASE_URL; koneksi baru dibuka saat query pertama.
  const connectionString = opts.url ?? process.env.DATABASE_URL;
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: opts.max, connectionTimeoutMillis: opts.connectionTimeoutMillis }),
  });
}
