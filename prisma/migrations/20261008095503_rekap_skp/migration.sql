-- CreateEnum
CREATE TYPE "StatusRekap" AS ENUM ('QUEUED', 'PROSES', 'SELESAI', 'GAGAL');

-- CreateTable
CREATE TABLE "RekapSKP" (
    "id" UUID NOT NULL,
    "periode_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "versi" INTEGER NOT NULL,
    "status" "StatusRekap" NOT NULL DEFAULT 'QUEUED',
    "ringkasan_json" JSONB,
    "file_xlsx_key" VARCHAR(500),
    "file_pdf_key" VARCHAR(500),
    "error_message" TEXT,
    "digenerate_oleh" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "RekapSKP_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RekapSKP_periode_id_status_idx" ON "RekapSKP"("periode_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RekapSKP_periode_id_user_id_versi_key" ON "RekapSKP"("periode_id", "user_id", "versi");

-- AddForeignKey
ALTER TABLE "RekapSKP" ADD CONSTRAINT "RekapSKP_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "Periode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RekapSKP" ADD CONSTRAINT "RekapSKP_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RekapSKP" ADD CONSTRAINT "RekapSKP_digenerate_oleh_fkey" FOREIGN KEY ("digenerate_oleh") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RekapSKP" ADD CONSTRAINT "RekapSKP_versi_check" CHECK ("versi" >= 1);
