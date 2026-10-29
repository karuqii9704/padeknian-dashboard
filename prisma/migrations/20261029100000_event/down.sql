-- Rollback manual: lalu hapus baris migrasi ini dari "_prisma_migrations".
-- Objek storage berawalan "event/" menjadi yatim dan perlu dibersihkan manual.
DROP TABLE IF EXISTS "EventLampiran";
DROP TABLE IF EXISTS "Event";
DROP TYPE IF EXISTS "JenisEvent";
