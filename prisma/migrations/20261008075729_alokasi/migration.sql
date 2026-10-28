-- CreateEnum
CREATE TYPE "Prioritas" AS ENUM ('RENDAH', 'SEDANG', 'TINGGI');

-- CreateEnum
CREATE TYPE "StatusAlokasi" AS ENUM ('AKTIF', 'SELESAI', 'DIBATALKAN');

-- CreateTable
CREATE TABLE "Alokasi" (
    "id" UUID NOT NULL,
    "periode_id" UUID NOT NULL,
    "tim_id" UUID NOT NULL,
    "kegiatan_id" UUID,
    "judul" VARCHAR(200) NOT NULL,
    "deskripsi" TEXT NOT NULL,
    "tanggal_mulai" DATE NOT NULL,
    "tanggal_selesai" DATE NOT NULL,
    "target_volume" DECIMAL(12,2) NOT NULL,
    "satuan" VARCHAR(30) NOT NULL,
    "prioritas" "Prioritas" NOT NULL DEFAULT 'SEDANG',
    "status" "StatusAlokasi" NOT NULL DEFAULT 'AKTIF',
    "alasan_pembatalan" TEXT,
    "dibuat_oleh" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Alokasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PenugasanAlokasi" (
    "id" UUID NOT NULL,
    "alokasi_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_volume" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PenugasanAlokasi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alokasi_periode_id_tim_id_idx" ON "Alokasi"("periode_id", "tim_id");

-- CreateIndex
CREATE INDEX "Alokasi_tim_id_idx" ON "Alokasi"("tim_id");

-- CreateIndex
CREATE INDEX "PenugasanAlokasi_user_id_idx" ON "PenugasanAlokasi"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "PenugasanAlokasi_alokasi_id_user_id_key" ON "PenugasanAlokasi"("alokasi_id", "user_id");

-- AddForeignKey
ALTER TABLE "Alokasi" ADD CONSTRAINT "Alokasi_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "Periode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alokasi" ADD CONSTRAINT "Alokasi_tim_id_fkey" FOREIGN KEY ("tim_id") REFERENCES "TimKerja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alokasi" ADD CONSTRAINT "Alokasi_kegiatan_id_fkey" FOREIGN KEY ("kegiatan_id") REFERENCES "Kegiatan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alokasi" ADD CONSTRAINT "Alokasi_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenugasanAlokasi" ADD CONSTRAINT "PenugasanAlokasi_alokasi_id_fkey" FOREIGN KEY ("alokasi_id") REFERENCES "Alokasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PenugasanAlokasi" ADD CONSTRAINT "PenugasanAlokasi_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integritas data alokasi.
ALTER TABLE "Alokasi" ADD CONSTRAINT "Alokasi_tanggal_check" CHECK ("tanggal_selesai" >= "tanggal_mulai");
ALTER TABLE "Alokasi" ADD CONSTRAINT "Alokasi_target_check" CHECK ("target_volume" > 0);
ALTER TABLE "Alokasi" ADD CONSTRAINT "Alokasi_pembatalan_check" CHECK ("status" <> 'DIBATALKAN' OR COALESCE(length(trim("alasan_pembatalan")), 0) > 0);
ALTER TABLE "PenugasanAlokasi" ADD CONSTRAINT "PenugasanAlokasi_target_check" CHECK ("target_volume" > 0);
