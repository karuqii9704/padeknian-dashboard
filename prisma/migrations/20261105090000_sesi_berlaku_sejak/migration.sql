-- Sesi (JWT) yang login sebelum waktu ini ditolak; diisi saat password diganti atau di-reset admin.
ALTER TABLE "User" ADD COLUMN "sesi_berlaku_sejak" TIMESTAMPTZ;
