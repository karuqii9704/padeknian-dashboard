-- CreateTable
CREATE TABLE "BuktiDukung" (
    "id" UUID NOT NULL,
    "pekerjaan_harian_id" UUID NOT NULL,
    "nama_asli" VARCHAR(255) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "ukuran_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuktiDukung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BuktiDukung_object_key_key" ON "BuktiDukung"("object_key");

-- CreateIndex
CREATE INDEX "BuktiDukung_pekerjaan_harian_id_idx" ON "BuktiDukung"("pekerjaan_harian_id");

-- CreateIndex
CREATE UNIQUE INDEX "BuktiDukung_pekerjaan_harian_id_checksum_sha256_key" ON "BuktiDukung"("pekerjaan_harian_id", "checksum_sha256");

-- AddForeignKey
ALTER TABLE "BuktiDukung" ADD CONSTRAINT "BuktiDukung_pekerjaan_harian_id_fkey" FOREIGN KEY ("pekerjaan_harian_id") REFERENCES "PekerjaanHarian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuktiDukung" ADD CONSTRAINT "BuktiDukung_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ukuran maksimum 10 MB per file (FR-25).
ALTER TABLE "BuktiDukung" ADD CONSTRAINT "BuktiDukung_ukuran_check" CHECK ("ukuran_bytes" > 0 AND "ukuran_bytes" <= 10485760);
