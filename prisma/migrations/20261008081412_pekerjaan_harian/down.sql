-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
DROP TABLE IF EXISTS "PekerjaanHarian";
DROP TYPE IF EXISTS "StatusVerifikasi";
DROP TYPE IF EXISTS "StatusPekerjaan";
