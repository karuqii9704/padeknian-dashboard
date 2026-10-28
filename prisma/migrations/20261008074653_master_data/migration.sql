-- CreateEnum
CREATE TYPE "PeranDalamTim" AS ENUM ('KETUA', 'ANGGOTA');

-- CreateEnum
CREATE TYPE "StatusPeriode" AS ENUM ('DRAFT', 'AKTIF', 'DIKUNCI');

-- CreateEnum
CREATE TYPE "JenisHariLibur" AS ENUM ('LIBUR_NASIONAL', 'CUTI_BERSAMA', 'LIBUR_LAIN');

-- CreateTable
CREATE TABLE "TimKerja" (
    "id" UUID NOT NULL,
    "nama" VARCHAR(120) NOT NULL,
    "tahun" INTEGER NOT NULL,
    "ketua_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "TimKerja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Periode" (
    "id" UUID NOT NULL,
    "tahun" INTEGER NOT NULL,
    "bulan" INTEGER NOT NULL,
    "tanggal_mulai" DATE NOT NULL,
    "tanggal_selesai" DATE NOT NULL,
    "jumlah_hari_kerja" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusPeriode" NOT NULL DEFAULT 'DRAFT',
    "dikunci_oleh" UUID,
    "dikunci_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Periode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnggotaTim" (
    "id" UUID NOT NULL,
    "tim_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "periode_id" UUID NOT NULL,
    "peran_dalam_tim" "PeranDalamTim" NOT NULL DEFAULT 'ANGGOTA',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnggotaTim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HariLibur" (
    "id" UUID NOT NULL,
    "tanggal" DATE NOT NULL,
    "keterangan" VARCHAR(160) NOT NULL,
    "jenis" "JenisHariLibur" NOT NULL,

    CONSTRAINT "HariLibur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kegiatan" (
    "id" UUID NOT NULL,
    "kode" VARCHAR(40),
    "uraian" TEXT NOT NULL,
    "satuan_default" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Kegiatan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimKerja_ketua_id_idx" ON "TimKerja"("ketua_id");

-- CreateIndex
CREATE UNIQUE INDEX "Periode_tahun_bulan_key" ON "Periode"("tahun", "bulan");

-- CreateIndex
CREATE INDEX "AnggotaTim_user_id_periode_id_idx" ON "AnggotaTim"("user_id", "periode_id");

-- CreateIndex
CREATE INDEX "AnggotaTim_periode_id_idx" ON "AnggotaTim"("periode_id");

-- CreateIndex
CREATE UNIQUE INDEX "AnggotaTim_tim_id_user_id_periode_id_key" ON "AnggotaTim"("tim_id", "user_id", "periode_id");

-- CreateIndex
CREATE UNIQUE INDEX "HariLibur_tanggal_key" ON "HariLibur"("tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "Kegiatan_kode_key" ON "Kegiatan"("kode");

-- AddForeignKey
ALTER TABLE "TimKerja" ADD CONSTRAINT "TimKerja_ketua_id_fkey" FOREIGN KEY ("ketua_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Periode" ADD CONSTRAINT "Periode_dikunci_oleh_fkey" FOREIGN KEY ("dikunci_oleh") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnggotaTim" ADD CONSTRAINT "AnggotaTim_tim_id_fkey" FOREIGN KEY ("tim_id") REFERENCES "TimKerja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnggotaTim" ADD CONSTRAINT "AnggotaTim_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnggotaTim" ADD CONSTRAINT "AnggotaTim_periode_id_fkey" FOREIGN KEY ("periode_id") REFERENCES "Periode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hanya satu periode berstatus AKTIF pada satu waktu (FR-9).
CREATE UNIQUE INDEX "Periode_satu_aktif_idx" ON "Periode"(("status")) WHERE "status" = 'AKTIF';

-- Bulan harus 1-12; tanggal selesai tidak boleh sebelum tanggal mulai.
ALTER TABLE "Periode" ADD CONSTRAINT "Periode_bulan_check" CHECK ("bulan" BETWEEN 1 AND 12);
ALTER TABLE "Periode" ADD CONSTRAINT "Periode_tanggal_check" CHECK ("tanggal_selesai" >= "tanggal_mulai");
