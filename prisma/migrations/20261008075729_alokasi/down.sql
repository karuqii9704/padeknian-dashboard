-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
DROP TABLE IF EXISTS "PenugasanAlokasi";
DROP TABLE IF EXISTS "Alokasi";
DROP TYPE IF EXISTS "StatusAlokasi";
DROP TYPE IF EXISTS "Prioritas";
