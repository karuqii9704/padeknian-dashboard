-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
DROP INDEX IF EXISTS "RekapSKP_batch_id_idx";
ALTER TABLE "RekapSKP" DROP COLUMN IF EXISTS "batch_id";
