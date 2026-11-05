-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
ALTER TABLE "User" DROP COLUMN IF EXISTS "sesi_berlaku_sejak";
