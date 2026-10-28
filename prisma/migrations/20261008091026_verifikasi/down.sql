-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
DROP TRIGGER IF EXISTS verifikasi_no_truncate ON "Verifikasi";
DROP TRIGGER IF EXISTS verifikasi_no_update_delete ON "Verifikasi";
DROP FUNCTION IF EXISTS verifikasi_append_only();
DROP TABLE IF EXISTS "Verifikasi";
DROP TYPE IF EXISTS "AksiVerifikasi";
