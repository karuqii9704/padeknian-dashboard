-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
ALTER TABLE "RekapSKP" DROP COLUMN IF EXISTS "is_final";
