-- Rollback manual untuk migrasi ini (Prisma tidak punya down otomatis).
-- Jalankan: psql "$DATABASE_URL" -f down.sql, lalu
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '<nama folder migrasi ini>';
DROP TRIGGER IF EXISTS audit_log_no_truncate ON "AuditLog";
DROP TRIGGER IF EXISTS audit_log_no_update_delete ON "AuditLog";
DROP FUNCTION IF EXISTS audit_log_append_only();
DROP TABLE IF EXISTS "AuditLog";
DROP TABLE IF EXISTS "User";
DROP TYPE IF EXISTS "Role";
