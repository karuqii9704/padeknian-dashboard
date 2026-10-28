-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
ALTER TABLE "PenugasanAlokasi" DROP COLUMN IF EXISTS "realisasi", DROP COLUMN IF EXISTS "menunggu", DROP COLUMN IF EXISTS "persen";
ALTER TABLE "Alokasi" DROP COLUMN IF EXISTS "realisasi", DROP COLUMN IF EXISTS "menunggu", DROP COLUMN IF EXISTS "persen";
