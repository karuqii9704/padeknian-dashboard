-- CreateEnum
CREATE TYPE "TipeNotifikasi" AS ENUM ('ALOKASI_BARU', 'VERIFIKASI', 'REVISI', 'PENGINGAT_HARIAN', 'REKAP_SELESAI');

-- CreateTable
CREATE TABLE "Notifikasi" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tipe" "TipeNotifikasi" NOT NULL,
    "judul" VARCHAR(200) NOT NULL,
    "isi" TEXT NOT NULL,
    "link" VARCHAR(300),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notifikasi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notifikasi_user_id_is_read_created_at_idx" ON "Notifikasi"("user_id", "is_read", "created_at");

-- AddForeignKey
ALTER TABLE "Notifikasi" ADD CONSTRAINT "Notifikasi_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
