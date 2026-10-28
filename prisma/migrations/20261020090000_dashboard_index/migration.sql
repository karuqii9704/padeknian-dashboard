-- Agregasi dashboard (tren harian, heatmap, tabel pegawai) memfilter periode + daftar pegawai lalu mengelompokkan per tanggal.
CREATE INDEX "PekerjaanHarian_periode_id_user_id_tanggal_idx" ON "PekerjaanHarian"("periode_id", "user_id", "tanggal");
