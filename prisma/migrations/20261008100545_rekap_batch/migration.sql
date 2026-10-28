-- Setiap permintaan generate adalah satu batch yang berbagi satu file XLSX multi-sheet.
-- Aman untuk tabel berisi: kolom ditambah nullable, baris lama dijadikan batch sendiri-sendiri, lalu NOT NULL.
ALTER TABLE "RekapSKP" ADD COLUMN "batch_id" UUID;
UPDATE "RekapSKP" SET "batch_id" = "id" WHERE "batch_id" IS NULL;
ALTER TABLE "RekapSKP" ALTER COLUMN "batch_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RekapSKP_batch_id_idx" ON "RekapSKP"("batch_id");
