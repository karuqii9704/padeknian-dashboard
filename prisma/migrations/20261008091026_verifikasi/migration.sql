-- CreateEnum
CREATE TYPE "AksiVerifikasi" AS ENUM ('SETUJUI', 'MINTA_REVISI', 'TOLAK');

-- CreateTable
CREATE TABLE "Verifikasi" (
    "id" UUID NOT NULL,
    "pekerjaan_harian_id" UUID NOT NULL,
    "verifikator_id" UUID NOT NULL,
    "aksi" "AksiVerifikasi" NOT NULL,
    "catatan" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verifikasi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Verifikasi_pekerjaan_harian_id_created_at_idx" ON "Verifikasi"("pekerjaan_harian_id", "created_at");

-- CreateIndex
CREATE INDEX "Verifikasi_verifikator_id_idx" ON "Verifikasi"("verifikator_id");

-- AddForeignKey
ALTER TABLE "Verifikasi" ADD CONSTRAINT "Verifikasi_pekerjaan_harian_id_fkey" FOREIGN KEY ("pekerjaan_harian_id") REFERENCES "PekerjaanHarian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verifikasi" ADD CONSTRAINT "Verifikasi_verifikator_id_fkey" FOREIGN KEY ("verifikator_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Verifikasi append-only: blokir UPDATE, DELETE, dan TRUNCATE di level database (FR-35).
CREATE OR REPLACE FUNCTION verifikasi_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Riwayat verifikasi bersifat append-only: % tidak diizinkan', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verifikasi_no_update_delete
BEFORE UPDATE OR DELETE ON "Verifikasi"
FOR EACH ROW EXECUTE FUNCTION verifikasi_append_only();

CREATE TRIGGER verifikasi_no_truncate
BEFORE TRUNCATE ON "Verifikasi"
FOR EACH STATEMENT EXECUTE FUNCTION verifikasi_append_only();

-- Catatan wajib >= 10 karakter untuk aksi selain SETUJUI (FR-32), ditegakkan juga di database.
ALTER TABLE "Verifikasi" ADD CONSTRAINT "Verifikasi_catatan_check" CHECK (
  "aksi" = 'SETUJUI' OR COALESCE(length(trim("catatan")), 0) >= 10
);
