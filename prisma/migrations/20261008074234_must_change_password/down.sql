-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
ALTER TABLE "User" DROP COLUMN IF EXISTS "must_change_password";
