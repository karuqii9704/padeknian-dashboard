-- AlterTable
ALTER TABLE "Alokasi" ADD COLUMN     "menunggu" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "persen" DECIMAL(8,1) NOT NULL DEFAULT 0,
ADD COLUMN     "realisasi" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PenugasanAlokasi" ADD COLUMN     "menunggu" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "persen" DECIMAL(8,1) NOT NULL DEFAULT 0,
ADD COLUMN     "realisasi" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Backfill agregat dari entri yang sudah ada (migrasi aman dijalankan di data berisi).
UPDATE "PenugasanAlokasi" p SET
  "realisasi" = COALESCE((SELECT SUM(h."volume") FROM "PekerjaanHarian" h WHERE h."penugasan_id" = p."id" AND h."status_verifikasi" = 'DISETUJUI'), 0),
  "menunggu"  = COALESCE((SELECT SUM(h."volume") FROM "PekerjaanHarian" h WHERE h."penugasan_id" = p."id" AND h."status_verifikasi" = 'MENUNGGU'), 0);
UPDATE "PenugasanAlokasi" SET "persen" = CASE WHEN "target_volume" > 0 THEN ROUND("realisasi" / "target_volume" * 100, 1) ELSE 0 END;
UPDATE "Alokasi" a SET
  "realisasi" = COALESCE((SELECT SUM(p."realisasi") FROM "PenugasanAlokasi" p WHERE p."alokasi_id" = a."id"), 0),
  "menunggu"  = COALESCE((SELECT SUM(p."menunggu") FROM "PenugasanAlokasi" p WHERE p."alokasi_id" = a."id"), 0);
UPDATE "Alokasi" a SET "persen" = COALESCE((
  SELECT CASE WHEN SUM(p."target_volume") > 0 THEN ROUND(a."realisasi" / SUM(p."target_volume") * 100, 1) ELSE 0 END
  FROM "PenugasanAlokasi" p WHERE p."alokasi_id" = a."id"), 0);
