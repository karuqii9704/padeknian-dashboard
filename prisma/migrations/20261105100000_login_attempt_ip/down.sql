-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
DROP INDEX IF EXISTS "LoginAttempt_ip_address_created_at_idx";
ALTER TABLE "LoginAttempt" DROP COLUMN IF EXISTS "ip_address";
