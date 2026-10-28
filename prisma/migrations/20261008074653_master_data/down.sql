-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
DROP TABLE IF EXISTS "AnggotaTim";
DROP TABLE IF EXISTS "TimKerja";
DROP TABLE IF EXISTS "Periode";
DROP TABLE IF EXISTS "HariLibur";
DROP TABLE IF EXISTS "Kegiatan";
DROP TYPE IF EXISTS "PeranDalamTim";
DROP TYPE IF EXISTS "StatusPeriode";
DROP TYPE IF EXISTS "JenisHariLibur";
