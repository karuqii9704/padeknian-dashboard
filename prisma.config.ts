import { defineConfig } from "prisma/config";

// Prisma 7: CLI tidak lagi membaca .env otomatis. Muat .env bila ada (pengembangan lokal);
// di CI/produksi variabel sudah diset oleh lingkungan.
try {
  process.loadEnvFile();
} catch {
  /* tidak ada .env */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Opsional di sini (bukan env()) agar `prisma generate` saat npm ci/Docker build tidak gagal tanpa DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL },
});
