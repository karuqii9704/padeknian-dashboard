-- CreateEnum
CREATE TYPE "StatusPekerjaan" AS ENUM ('BELUM_MULAI', 'PROSES', 'SELESAI');

-- CreateEnum
CREATE TYPE "StatusVerifikasi" AS ENUM ('MENUNGGU', 'DISETUJUI', 'MINTA_REVISI', 'DITOLAK');

-- CreateTable
CREATE TABLE "PekerjaanHarian" (
    "id" UUID NOT NULL,
    "periode_id" UUID NOT NULL,
    "penugasan_id" UUID,
    "user_id" UUID NOT NULL,
    "tanggal" DATE NOT NULL,
    "is_ad_hoc" BOOLEAN NOT NULL DEFAULT false,
    "judul_ad_hoc" VARCHAR(200),
    "deskripsi_capaian" TEXT NOT NULL,
    "volume" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "satuan" VARCHAR(30) NOT NULL,
    "status" "StatusPekerjaan" NOT NULL DEFAULT 'PROSES',
    "kendala" TEXT,
    "is_backfill" BOOLEAN NOT NULL DEFAULT false,
    "status_verifikasi" "StatusVerifikasi" NOT NULL DEFAULT 'MENUNGGU',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "PekerjaanHarian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PekerjaanHarian_user_id_tanggal_idx" ON "PekerjaanHarian"("user_id", "tanggal");

-- CreateIndex
CREATE INDEX "PekerjaanHarian_periode_id_status_verifikasi_idx" ON "PekerjaanHarian"("periode_id", "status_verifikasi");

-- CreateIndex
CREATE INDEX "PekerjaanHarian_penugasan_id_status_verifikasi_idx" ON "PekerjaanHarian"("penugasan_id", "status_verifikasi");

-- AddForeignKey
ALTER TABLE "PekerjaanHarian" ADD CONSTRAINT "PekerjaanHarian_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "Periode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PekerjaanHarian" ADD CONSTRAINT "PekerjaanHarian_penugasan_id_fkey" FOREIGN KEY ("penugasan_id") REFERENCES "PenugasanAlokasi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PekerjaanHarian" ADD CONSTRAINT "PekerjaanHarian_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Entri ad-hoc wajib berjudul dan tanpa penugasan; entri terikat alokasi wajib punya penugasan.
ALTER TABLE "PekerjaanHarian" ADD CONSTRAINT "PekerjaanHarian_adhoc_check" CHECK (
  ("is_ad_hoc" AND "penugasan_id" IS NULL AND COALESCE(length(trim("judul_ad_hoc")), 0) > 0)
  OR (NOT "is_ad_hoc" AND "penugasan_id" IS NOT NULL)
);
ALTER TABLE "PekerjaanHarian" ADD CONSTRAINT "PekerjaanHarian_volume_check" CHECK ("volume" >= 0);
