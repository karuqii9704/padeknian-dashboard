-- CreateEnum
CREATE TYPE "JenisEvent" AS ENUM ('RAPAT', 'PELATIHAN', 'SURVEI_LAPANGAN', 'LAINNYA');

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "periode_id" UUID NOT NULL,
    "judul" VARCHAR(200) NOT NULL,
    "jenis" "JenisEvent" NOT NULL,
    "tanggal_mulai" DATE NOT NULL,
    "tanggal_selesai" DATE NOT NULL,
    "lokasi" VARCHAR(200) NOT NULL,
    "peran" VARCHAR(80) NOT NULL,
    "uraian_hasil" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLampiran" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "nama_asli" VARCHAR(255) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "ukuran_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLampiran_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_user_id_tanggal_mulai_idx" ON "Event"("user_id", "tanggal_mulai");

-- CreateIndex
CREATE INDEX "Event_periode_id_user_id_idx" ON "Event"("periode_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "EventLampiran_object_key_key" ON "EventLampiran"("object_key");

-- CreateIndex
CREATE INDEX "EventLampiran_event_id_idx" ON "EventLampiran"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "EventLampiran_event_id_checksum_sha256_key" ON "EventLampiran"("event_id", "checksum_sha256");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "Periode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLampiran" ADD CONSTRAINT "EventLampiran_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLampiran" ADD CONSTRAINT "EventLampiran_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tanggal selesai tidak boleh sebelum tanggal mulai.
ALTER TABLE "Event" ADD CONSTRAINT "event_tanggal_urut" CHECK ("tanggal_selesai" >= "tanggal_mulai");
