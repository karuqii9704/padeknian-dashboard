<!-- plankit project:a5aa6ed6-5571-4c32-a91b-079706ac92a9 | managed file: keep task ids, only edit the [ ] markers -->

# Task: Dashboard Manajemen Pekerjaan Harian & Rekap SKP Pegawai BPS Kabupaten Kerinci

Penanda status: `[ ]` belum · `[~]` sedang dikerjakan · `[x]` selesai · `[!]` terblokir.

Aturan untuk agent:
1. Ambil task paling atas yang belum selesai dan semua "Butuh"-nya sudah `[x]`.
2. Ganti penandanya jadi `[~]` saat mulai, `[x]` hanya jika semua poin "Selesai jika" terpenuhi.
3. Kalau terblokir, pakai `[!]` dan tulis alasannya di baris "Catatan".
4. Jangan ubah id, urutan, atau menghapus task. Rencana lengkap ada di PRD.md di folder ini.

## Fase 1 · Autentikasi & Manajemen Pengguna
- [x] t1 · Set up skeleton proyek Next.js 15 + Prisma + Docker Compose (M)
  - Kerjakan: Inisialisasi repo: Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui, struktur folder app/, app/api/, lib/, prisma/, worker/. Setup Prisma dengan datasource PostgreSQL 16, .env.example (DATABASE_URL, NEXTAUTH_SECRET, S3_ENDPOINT/S3_KEY/S3_SECRET, SMTP_*), logger pino JSON, dan endpoint GET /api/health yang mengecek koneksi DB. Tulis docker-compose.yml (app, postgres, minio) + Dockerfile multi-stage, plus skrip npm dev/build/start/migrate/seed. Siapkan Vitest + Playwright config dasar.
  - Selesai jika: `docker compose up` menyalakan app, postgres, dan minio tanpa error; halaman root render tanpa crash; GET /api/health mengembalikan 200 dengan status DB ok dan format JSON; `npx prisma migrate dev` sukses membuat schema kosong dan `npm run test` (Vitest) jalan
- [x] t2 · Schema Prisma User + AuditLog dan seed admin awal (S)
  - Butuh: t1
  - Kerjakan: Definisikan model User (id uuid, nip varchar(18) unique, nama, email nullable unique, password_hash, role enum PEGAWAI/KETUA_TIM/PIMPINAN/ADMIN, jabatan, is_active, last_login_at, timestamps) dan AuditLog (bigserial, user_id nullable, aksi, entitas, entitas_id, metadata jsonb, ip_address inet, created_at) sesuai Section 11. Buat migrasi Prisma versioned dan seed script yang membuat 1 akun ADMIN awal dari env (tanpa password default aktif di produksi). Tambahkan indeks pada nip, email, dan (entitas, entitas_id) di AuditLog.
  - Selesai jika: Migrasi membuat tabel User dan AuditLog dengan kolom sesuai Section 11 dan bisa di-rollback; Seed menghasilkan 1 user role ADMIN dengan hash bcrypt cost 12; Ada helper lib/audit.ts untuk menulis AuditLog append-only (tanpa endpoint update/delete)
- [x] t3 · Login credentials Auth.js (NIP/email + bcrypt) + sesi & logout (M)
  - Butuh: t2
  - Kerjakan: Implementasi FR-1 dan FR-4: Auth.js/NextAuth v5 Credentials Provider dengan dukungan login pakai NIP atau email, verifikasi bcrypt, dan sesi JWT di cookie HttpOnly+Secure+SameSite=Lax dengan maxAge 8 jam serta idle timeout 60 menit. Buat POST /api/auth/login, POST /api/auth/logout, dan GET /api/me (profil + peran + tim). Update last_login_at dan tulis AuditLog aksi LOGIN pada setiap login sukses. Terapkan rate limit login 5 gagal per NIP per 15 menit (lockout 15 menit).
  - Selesai jika: Login dengan NIP benar membuka sesi 8 jam; login dengan email juga berhasil; Terlambat idle > 60 menit atau setelah 5 percobaan gagal → 429/401 dengan pesan Bahasa Indonesia; POST /api/auth/logout menghapus sesi dan AuditLog LOGIN tercatat
- [x] t4 · Middleware RBAC 4 peran + ganti password sendiri (M)
  - Butuh: t3
  - Kerjakan: Implementasi FR-2 dan FR-5: helper requireRole(...roles) yang dipakai di Route Handlers/Server Actions, menolak HTTP 403 untuk akses di luar peran, plus helper ownership check (PEMILIK). Buat PATCH /api/me/password dengan validasi minimal 8 karakter dan penolakan password yang sama dengan 3 password terakhir (simpan hash historis di tabel UserPasswordHistory). Semua logika otorisasi di server, bukan di client.
  - Selesai jika: Endpoint yang diproteksi mengembalikan 403 saat diakses peran yang tidak berhak (uji via request langsung, bukan UI); PATCH /api/me/password sukses ganti password dan menolak password < 8 karakter atau sama dengan 3 password terakhir dengan pesan Bahasa Indonesia; Middleware RBAC dipakai ulang oleh minimal satu endpoint dummy untuk uji regresi
- [x] t5 · CRUD pengguna oleh ADMIN + reset password + AuditLog (M)
  - Butuh: t4
  - Kerjakan: Implementasi FR-3 dan FR-6: GET/POST /api/pengguna (pagination + filter role/aktif), PATCH /api/pengguna/:id (ubah profil, peran, is_active tanpa menghapus riwayat pekerjaan), dan POST /api/pengguna/:id/reset-password (generate password sementara, paksa ganti saat login pertama). Setiap perubahan peran, reset password, dan penonaktifan akun menulis AuditLog berisi nilai sebelum/sesudah di metadata. UI halaman admin: tabel pengguna, dialog form, tombol reset/nonaktifkan.
  - Selesai jika: ADMIN bisa membuat, mengubah peran, reset password, dan menonaktifkan akun; user nonaktif tidak bisa login; Menonaktifkan akun tidak menghapus User dan data terkait; AuditLog berisi aksi UBAH_PERAN/RESET_PASSWORD/NONAKTIF_AKUN dengan metadata before/after

## Fase 1 · Master Data Organisasi & Periode Bulanan
- [x] t6 · Schema Prisma TimKerja, AnggotaTim, Periode, HariLibur, Kegiatan (M)
  - Butuh: t2
  - Kerjakan: Definisikan model sesuai Section 11: TimKerja (nama, tahun, ketua_id FK User), AnggotaTim (tim_id, user_id, periode_id, peran_dalam_tim KETUA/ANGGOTA), Periode (tahun+bulan unique, tanggal_mulai/selesai, jumlah_hari_kerja, status DRAFT/AKTIF/DIKUNCI, dikunci_oleh/dikunci_at), HariLibur (tanggal unique, keterangan, jenis), Kegiatan (kode unique, uraian, satuan_default, is_active). Tambahkan migrasi versioned dan constraint unik yang dibutuhkan.
  - Selesai jika: Migrasi membuat 5 tabel dengan constraint unik (tahun,bulan) pada Periode dan unique tanggal pada HariLibur; Relasi FK ke User dan Periode terdefinisi dan bisa di-rollback; Seed opsional menambahkan beberapa HariLibur nasional contoh untuk tahun berjalan
- [x] t7 · CRUD TimKerja + penetapan anggota per periode (FR-7, FR-8) (M)
  - Butuh: t6
  - Kerjakan: Implementasi GET/POST /api/tim dan PATCH /api/tim/:id (buat tim, ubah nama, ganti ketua yang wajib berperan KETUA_TIM), serta GET /api/tim/:id/anggota dan POST /api/tim/:id/anggota untuk menambah/menghapus anggota pada periode tertentu. Simpan riwayat keanggotaan lewat AnggotaTim sehingga pegawai bisa pindah tim antar periode tanpa merusak data lama. UI admin: daftar tim, form tim, dan panel anggota per periode.
  - Selesai jika: ADMIN bisa membuat tim dan menetapkan ketua; sistem menolak ketua yang bukan role KETUA_TIM; Penambahan/penghapusan anggota tersimpan sebagai baris AnggotaTim per periode dan tidak menghapus riwayat periode lama; GET /api/tim/:id/anggota mengembalikan anggota sesuai periode yang diminta
- [x] t8 · CRUD Periode + aktivasi + kalender hari kerja efektif + HariLibur (FR-9, FR-10, FR-11) (M)
  - Butuh: t6
  - Kerjakan: Implementasi GET/POST /api/periode, POST /api/periode/:id/aktifkan (menjamin hanya satu periode AKTIF pada satu waktu), dan GET /api/periode/:id/hari-kerja. Hitung jumlah_hari_kerja otomatis = Senin–Jumat dalam rentang periode dikurangi entri HariLibur, disimpan di Periode.jumlah_hari_kerja dan dihitung ulang saat HariLibur berubah. Implementasi GET/POST /api/hari-libur dan DELETE /api/hari-libur/:id. UI admin untuk kelola periode dan hari libur.
  - Selesai jika: Mengaktifkan periode baru otomatis menurunkan status periode AKTIF sebelumnya (tetap tunggal); jumlah_hari_kerja cocok dengan hitungan manual untuk 1 bulan uji yang mengandung Sabtu/Minggu dan minimal 1 hari libur; Tambah/hapus HariLibur memicu perhitungan ulang jumlah_hari_kerja periode terkait
- [x] t9 · Master Kegiatan opsional (FR-12) (S)
  - Butuh: t6
  - Kerjakan: Implementasi CRUD Kegiatan (GET/POST/PATCH) dengan field kode, uraian, satuan_default, is_active, dibatasi ADMIN untuk tulis dan semua peran untuk baca. UI admin berupa tabel sederhana + dialog form, dipakai sebagai label opsional pada alokasi di Fase berikutnya. Sembunyikan kegiatan non-aktif dari dropdown alokasi tapi tetap tampil di data historis.
  - Selesai jika: ADMIN bisa membuat/menonaktifkan Kegiatan; kode unik divalidasi; GET /api/kegiatan bisa difilter by is_active untuk kebutuhan dropdown; Kegiatan non-aktif tetap muncul saat direferensikan data alokasi lama

## Fase 1 · Alokasi Pekerjaan oleh Ketua Tim
- [x] t10 · Schema + API alokasi dan penugasan banyak anggota (FR-13, FR-14, FR-15) (L)
  - Butuh: t7, t8
  - Kerjakan: Definisikan model Alokasi dan PenugasanAlokasi sesuai Section 11, lalu implementasi GET /api/alokasi (filter periode, tim, penerima) dan POST /api/alokasi yang menerima judul, deskripsi, rentang tanggal, target_volume, satuan, prioritas, kegiatan_id opsional, dan daftar penugasan (satu atau lebih user dengan target_volume per orang yang bisa berbeda). Validasi: satu alokasi hanya boleh dalam satu periode, rentang tanggal dalam periode, dan periode yang DIKUNCI menolak create/update (FR-15) dengan 409 + pesan Bahasa Indonesia. Juga PATCH /api/alokasi/:id.
  - Selesai jika: POST /api/alokasi dengan 2 anggota menghasilkan 1 Alokasi + 2 PenugasanAlokasi dengan target berbeda; Pembuatan/perubahan alokasi pada periode DIKUNCI ditolak 409; Rentang tanggal di luar periode ditolak dengan pesan validasi Bahasa Indonesia
- [x] t11 · UI form alokasi multi-anggota oleh Ketua Tim (FR-13) (M)
  - Butuh: t10
  - Kerjakan: Halaman Alokasi: daftar alokasi dengan filter periode/tim, tombol Tambah, dan form React Hook Form + Zod yang mencakup judul, deskripsi, target volume + satuan, rentang tanggal, prioritas, serta pemilihan anggota tim (multi-select dengan input target per orang). Default tim = tim milik KETUA_TIM yang login. Setelah simpan sukses, tampilkan daftar alokasi dengan progress bar 0% dan tombol unduh daftar (copy untuk WhatsApp). Sertakan tombol Salin dari bulan lalu (dipasang di t12).
  - Selesai jika: Ketua tim bisa membuat alokasi ke minimal 2 anggota sekaligus dari satu form; Validasi Zod menampilkan error Bahasa Indonesia inline untuk field wajib yang kosong; Setelah simpan, alokasi muncul di daftar dengan progress bar dan tombol unduh daftar
- [x] t12 · Aksi salin alokasi dari periode sebelumnya (FR-16) (M)
  - Butuh: t11
  - Kerjakan: Implementasi POST /api/alokasi/salin yang mengambil daftar alokasi dari periode sebelumnya (opsional difilter tim) dan mengembalikannya sebagai draft tanpa capaian dan tanpa bukti, untuk direview sebelum disimpan. UI: dialog centang alokasi rutin → tampilkan preview editable → simpan sebagai alokasi baru di periode berjalan. Tolak jika periode target DIKUNCI.
  - Selesai jika: Salin menghasilkan draft alokasi baru di periode berjalan tanpa membawa capaian/bukti periode lama; Ketua tim bisa mengedit draft sebelum menyimpan dan membatalkan tanpa efek samping; Salin ke periode DIKUNCI ditolak dengan pesan yang jelas
- [x] t13 · Progress realisasi + pembatalan alokasi beralasan (FR-17, FR-18) (M)
  - Butuh: t10
  - Kerjakan: Implementasi perhitungan progres alokasi = SUM(volume entri disetujui) / target_volume, ditampilkan sebagai angka dan progress bar (per penugasan bila target per orang beda). Implementasi POST /api/alokasi/:id/batalkan: tolak hard-delete jika sudah ada entri harian, ubah status ke DIBATALKAN dan wajib alasan_pembatalan. Endpoint DELETE hanya boleh untuk alokasi tanpa entri.
  - Selesai jika: Progress bar dan angka realisasi cocok dengan SUM(volume) entri berstatus DISETUJUI dibagi target, untuk 1 alokasi uji; Penghapusan alokasi yang sudah punya entri ditolak; pembatalan beralasan mengubah status ke DIBATALKAN; Pembatalan tanpa alasan minimal 1 karakter ditolak validasi

## Fase 1 · Catatan Pekerjaan Harian Pegawai
- [x] t14 · Schema + API entri pekerjaan harian (FR-19, FR-21, FR-23) (L)
  - Butuh: t11
  - Kerjakan: Definisikan model PekerjaanHarian sesuai Section 11 (periode_id denormalisasi, penugasan_id nullable, is_ad_hoc + judul_ad_hoc, deskripsi_capaian, volume, satuan, status BELUM_MULAI/PROSES/SELESAI, kendala, is_backfill, status_verifikasi MENUNGGU/DISETUJUI/MINTA_REVISI/DITOLAK). Implementasi GET /api/pekerjaan-harian (filter tanggal/user/status), POST (wajib pilih PenugasanAlokasi milik sendiri atau ad-hoc), GET /api/pekerjaan-harian/:id, PATCH dan DELETE yang hanya boleh oleh PEMILIK selama periode belum DIKUNCI dan status_verifikasi bukan DISETUJUI (FR-23).
  - Selesai jika: Pegawai bisa membuat entri terikat alokasi miliknya dan entri ad-hoc dengan is_ad_hoc=true; PATCH/DELETE entri milik pegawai lain atau pada periode DIKUNCI atau berstatus DISETUJUI ditolak (403/409); GET detail mengembalikan entri + daftar bukti + riwayat verifikasi (riwayat kosong di fase ini)
- [x] t15 · Validasi hari kerja, periode AKTIF, dan backfill maks 3 hari (FR-20) (M)
  - Butuh: t14
  - Kerjakan: Tambahkan validator server di POST /api/pekerjaan-harian: tanggal wajib hari kerja (bukan Sabtu/Minggu/HariLibur), berada di dalam rentang periode AKTIF, dan jika tanggal < hari ini maka selisih maksimal 3 hari kalender serta set is_backfill = true. Pesan error Bahasa Indonesia yang spesifik per kasus. Sertakan unit test untuk kombinasi hari libur, akhir pekan, dan backfill lebih dari 3 hari.
  - Selesai jika: Entri pada Sabtu/Minggu/hari libur ditolak dengan pesan jelas; Backfill > 3 hari ditolak; backfill ≤ 3 hari tersimpan dengan is_backfill=true; Tanggal di luar periode AKTIF ditolak
- [x] t16 · Recalculate akumulasi volume & progres alokasi (FR-22) (M)
  - Butuh: t14
  - Kerjakan: Implementasi service recalculateProgresAlokasi(alokasiId) yang dihitung ulang setiap kali entri dibuat, diubah, dihapus, atau status verifikasinya berubah. Simpan hasil agregat (sum volume disetujui, sum volume menunggu, persentase) agar daftar alokasi dan dashboard bisa query cepat tanpa agregasi berat per request. Panggil service ini dari endpoint pekerjaan-harian dan dari endpoint verifikasi (f6).
  - Selesai jika: Membuat/mengubah/menghapus entri langsung memperbarui angka progres alokasi terkait; Angka agregat cocok dengan query SUM volume entri DISETUJUI langsung ke tabel, untuk 1 alokasi uji; Recalculate bersifat idempoten saat dipanggil dua kali untuk data yang sama
- [x] t17 · UI Hari Ini + form entri cepat < 2 menit + kalender bulanan (FR-24) (L)
  - Butuh: t14, t15
  - Kerjakan: Halaman /hari-ini menampilkan daftar alokasi berjalan milik pegawai (default highlight prioritas TINGGI dengan deadline terdekat) dan status pengisian hari ini. Form + Catat Pekerjaan: dropdown alokasi, deskripsi capaian, volume (default sisa target), status, kendala, simpan dalam ≤ 2 menit dari HP (tombol ≥ 44px). Halaman kalender bulanan yang menandai tiap hari kerja: tanpa entri, ada entri menunggu, ada entri disetujui, atau ada yang perlu revisi, plus badge Revisi.
  - Selesai jika: Dari login sampai entri tersimpan bisa dilakukan < 2 menit di viewport 360px; Kalender menandai hari kerja dengan 4 status warna sesuai status entri hari itu; Badge Revisi muncul ketika ada entri berstatus MINTA_REVISI

## Fase 1 · Bukti Dukung
- [x] t18 · Object storage client + upload bukti dengan validasi MIME + magic bytes (FR-25, FR-26, FR-29) (L)
  - Butuh: t14
  - Kerjakan: Definisikan model BuktiDukung sesuai Section 11 (object_key unik, mime_type hasil deteksi magic bytes, ukuran_bytes, checksum_sha256, uploaded_by). Buat lib/storage.ts untuk MinIO/S3 (putObject, getSignedUrl 15 menit, deleteObject). Implementasi POST /api/pekerjaan-harian/:id/bukti (multipart) yang memvalidasi tipe via MIME + magic bytes (bukan ekstensi), batas 10 MB dan maks 10 file per entri, generate object_key format periode/YYYY-MM/userId/uuid.ext, hitung checksum sha256, dan simpan metadata. Bucket tidak public. Implementasi GET /api/bukti/:id/download yang memeriksa otorisasi lalu redirect ke signed URL ≤ 15 menit.
  - Selesai jika: Upload jpg/png/pdf/docx/xlsx valid sukses dan tersimpan di object storage dengan nama UUID; File .exe yang di-rename .pdf ditolak (uji magic bytes), file > 10 MB ditolak; Akses URL object storage tanpa signed URL gagal; signed URL kedaluwarsa ≤ 15 menit
- [x] t19 · UI upload progress + pratinjau + indikator kelengkapan bukti (FR-27, FR-30) (M)
  - Butuh: t18
  - Kerjakan: Komponen upload dengan pilihan kamera/file, progress bar, retry-friendly, dan thumbnail setelah sukses. Pratinjau inline untuk gambar dan PDF (iframe/object URL), ikon generik + tombol unduh untuk docx/xlsx. Kompresi gambar di sisi client sebelum upload. Tampilkan indikator ikon + label "Ada bukti"/"Belum ada bukti" pada setiap baris entri di daftar pekerjaan harian dan profil alokasi.
  - Selesai jika: Upload 10 MB pada koneksi terbatas menampilkan progress dan bisa retry tanpa menduplikasi file; Gambar/PDF terpratinjau inline; docx/xlsx menampilkan ikon + tombol unduh; Baris entri menampilkan label Ada/Belum ada bukti yang akurat
- [x] t20 · Hapus/ganti bukti sebelum entri DISETUJUI (FR-28) (S)
  - Butuh: t18
  - Kerjakan: Implementasi DELETE /api/bukti/:id yang hanya boleh oleh PEMILIK (uploaded_by) dan hanya jika entri induk belum berstatus DISETUJUI serta periode belum DIKUNCI; hapus object dari storage dan metadata dari DB. UI: tombol hapus per thumbnail dengan dialog konfirmasi dan aksi ganti file (upload baru + hapus lama dalam satu alur).
  - Selesai jika: Hapus bukti pada entri DISETUJUI atau periode DIKUNCI ditolak (403/409); Menghapus bukti juga menghapus object dari storage (tidak meninggalkan orphan); Ganti file menghasilkan bukti baru dan menghapus bukti lama dalam satu aksi

## Fase 2 · Verifikasi & Umpan Balik Ketua Tim
- [x] t21 · Schema Verifikasi append-only + antrean verifikasi (FR-31, FR-35) (M)
  - Butuh: t16, t19
  - Kerjakan: Definisikan model Verifikasi (pekerjaan_harian_id, verifikator_id, aksi, catatan, created_at) sesuai Section 11 dan terapkan larangan update/delete (tidak ada endpoint PATCH/DELETE; di level DB gunakan trigger atau revoke hak). Implementasi GET /api/verifikasi/antrean yang mengembalikan entri anggota tim milik KETUA_TIM yang login, hanya status MENUNGGU, diurutkan dari yang paling lama menunggu. UI halaman Verifikasi dengan pratinjau deskripsi, volume, dan bukti inline.
  - Selesai jika: Antrean hanya menampilkan entri anggota tim sendiri dan urut dari paling lama; Percobaan PATCH/DELETE ke /api/verifikasi/:id mengembalikan 405/403; Setiap baris Verifikasi menyimpan verifikator_id dan created_at
- [x] t22 · Aksi verifikasi SETUJUI/MINTA_REVISI/TOLAK + catatan (FR-32) (M)
  - Butuh: t21
  - Kerjakan: Implementasi POST /api/pekerjaan-harian/:id/verifikasi yang menerima aksi dan catatan. Aksi selain SETUJUI mewajibkan catatan minimal 10 karakter (validasi Zod). Perbarui status_verifikasi entri, tulis baris Verifikasi baru (append-only), dan panggil recalculateProgresAlokasi (t16). Tolak jika verifikator bukan KETUA_TIM dari tim entri tersebut (403).
  - Selesai jika: SETUJUI mengubah status ke DISETUJUI tanpa catatan; MINTA_REVISI/TOLAK tanpa catatan ≥ 10 karakter ditolak; Ketua tim dari tim lain menerima 403 saat mencoba memverifikasi; Setiap aksi menulis satu baris Verifikasi baru dan memicu recalculate progres
- [x] t23 · Bulk approve entri terpilih (FR-33) (M)
  - Butuh: t22
  - Kerjakan: Implementasi POST /api/verifikasi/bulk yang menerima daftar ID entri, memvalidasi semuanya milik tim verifikator dan berstatus MENUNGGU, lalu menulis baris Verifikasi SETUJUI untuk masing-masing dalam satu transaksi. UI: centang beberapa baris di antrean → tombol Setujui terpilih → dialog konfirmasi berisi jumlah entri dan daftar tanggal yang akan disetujui → jalankan dan tampilkan hasil per entri.
  - Selesai jika: Bulk approve 20 entri selesai dalam ≤ 10 menit alur UI termasuk pembacaan bukti; Entri milik tim lain atau yang bukan MENUNGGU di dalam daftar membuat seluruh batch ditolak dengan pesan jelas; Konfirmasi menampilkan jumlah dan daftar tanggal sebelum eksekusi
- [x] t24 · Notifikasi in-app status verifikasi + akses Pimpinan read-only (FR-34, FR-36) (M)
  - Butuh: t22
  - Kerjakan: Definisikan model Notifikasi sesuai Section 11 dan buat helper lib/notify.ts. Setiap perubahan status verifikasi entri membuat notifikasi in-app ke pegawai pemilik entri, memuat catatan verifikator dan link ke entri. Implementasi GET /api/notifikasi dan POST /api/notifikasi/:id/baca (hanya PEMILIK). Tambahkan akses PIMPINAN untuk melihat status verifikasi agregat per pegawai (read-only, endpoint terpisah atau flag pada endpoint dashboard) tanpa hak mengubah.
  - Selesai jika: Mengubah status verifikasi menghasilkan notifikasi in-app ≤ 1 menit dengan catatan verifikator; PIMPINAN bisa melihat agregat status verifikasi per pegawai tetapi POST verifikasi mengembalikan 403; POST /api/notifikasi/:id/baca hanya berhasil untuk pemilik notifikasi

## Fase 2 · Dashboard Monitoring Pimpinan
- [x] t25 · Kartu ringkasan KPI periode berjalan (FR-37) (M)
  - Butuh: t24, t16
  - Kerjakan: Implementasi GET /api/dashboard/ringkasan (KETUA_TIM, PIMPINAN) yang mengembalikan: jumlah pegawai aktif, jumlah alokasi periode ini, entri terisi hari ini, entri menunggu verifikasi, dan persentase entri yang punya bukti. Default periode AKTIF dan tim milik pengguna. Optimalkan dengan indeks/agregat tersimpan agar p95 ≤ 2 detik. UI kartu ringkasan di halaman dashboard.
  - Selesai jika: Endpoint mengembalikan 5 KPI dan cocok dengan query SQL manual untuk 1 periode uji (selisih 0); p95 waktu respons endpoint ≤ 2,0 detik pada data uji 1 periode × 100 pegawai × 22 hari; Default filter periode AKTIF dan tim pengguna diterapkan benar
- [x] t26 · Tabel per pegawai + filter + drill-down entri (FR-38, FR-39, FR-40) (L)
  - Butuh: t25
  - Kerjakan: Implementasi GET /api/dashboard/pegawai (jumlah entri, total volume per satuan, persentase hari kerja terisi, jumlah entri belum diverifikasi, status verifikasi terakhir) dengan filter periode, tim kerja, dan pegawai. Implementasi GET /api/dashboard/pegawai/:id untuk drill-down daftar entri harian pegawai pada periode terpilih lengkap dengan pratinjau bukti (pakai signed URL dari t18). UI tabel yang bisa diklik per baris dan panel drill-down.
  - Selesai jika: Tabel menampilkan kolom sesuai FR-38 dan angka cocok dengan query manual; Filter periode/tim/pegawai mengubah data tanpa reload penuh; Klik baris pegawai membuka drill-down entri harian dengan pratinjau bukti inline
- [x] t27 · Ekspor snapshot dashboard ke XLSX + lonceng notifikasi (FR-41, FR-42) (M)
  - Butuh: t26
  - Kerjakan: Implementasi GET /api/dashboard/export yang menghasilkan XLSX snapshot tabel dashboard sesuai filter aktif memakai ExcelJS. UI: tombol Ekspor dengan indikator proses dan unduhan via signed URL. Implementasi ikon lonceng notifikasi in-app di header dengan jumlah belum dibaca dan daftar notifikasi terbaru (memakai model Notifikasi dari t24) serta aksi tandai dibaca.
  - Selesai jika: Ekspor XLSX mengikuti filter yang aktif dan bisa diunduh lewat signed URL; Ikon lonceng menampilkan jumlah belum dibaca yang akurat dan bisa menandai dibaca; Ekspor data besar (1 periode penuh) tidak memblokir request UI

## Fase 3 · Rekap Bulanan & Ekspor SKP
- [x] t28 · Schema RekapSKP + worker pg-boss + generate rekap asinkron (FR-43) (L)
  - Butuh: t24, t26
  - Kerjakan: Definisikan model RekapSKP sesuai Section 11 (periode_id, user_id, versi, status QUEUED/PROSES/SELESAI/GAGAL, ringkasan_json jsonb, file_xlsx_key/file_pdf_key, error_message, digenerate_oleh). Set up pg-boss sebagai job queue dan proses worker terpisah (worker/index.ts). Implementasi POST /api/rekap/generate yang membuat job per pegawai, worker menghitung agregat dari alokasi + entri harian + capaian volume + status verifikasi + jumlah bukti, menyimpan ringkasan_json dan memperbarui status. GET /api/rekap/:periodeId mengembalikan daftar rekap + status.
  - Selesai jika: Generate 1 periode penuh selesai ≤ 60 detik dan status per pegawai terlihat di UI (paling lambat via polling); Hanya entri berstatus DISETUJUI yang masuk capaian final; volume MENUNGGU dicatat sebagai kolom terpisah di ringkasan_json; Job gagal menyimpan error_message dan status GAGAL tanpa menghentikan job lain
- [x] t29 · Ekspor rekap XLSX multi-sheet (FR-44) (M)
  - Butuh: t28
  - Kerjakan: Worker menulis file XLSX memakai ExcelJS: satu sheet ringkasan semua pegawai, plus satu sheet detail per pegawai dengan baris = alokasi dan kolom target, realisasi, satuan, % capaian, jumlah bukti, tanggal-tanggal pelaksanaan. Simpan ke object storage dan isi file_xlsx_key di RekapSKP. Implementasi GET /api/rekap/:id/download?format=xlsx yang mengembalikan signed URL. Nama sheet disanitize dan dibatasi 31 karakter.
  - Selesai jika: XLSX berisi 1 sheet ringkasan + 1 sheet per pegawai; jumlah baris sheet pegawai = jumlah alokasi pegawai itu; Total volume di file sama persis dengan SUM(volume) entri DISETUJUI (uji 3 skenario termasuk entri MINTA_REVISI yang dikecualikan); Unduhan memakai signed URL, bukan URL publik permanen
- [x] t30 · Ekspor rekap PDF per pegawai siap cetak (FR-45) (M)
  - Butuh: t28
  - Kerjakan: Worker menghasilkan PDF per pegawai memakai @react-pdf/renderer (atau Puppeteer) berisi header instansi, periode, identitas pegawai, dan tabel capaian. Simpan ke object storage dan isi file_pdf_key. Implementasi dukungan format=pdf pada GET /api/rekap/:id/download. Pastikan tampilan tabel rapi saat dicetak A4 dan teks Bahasa Indonesia.
  - Selesai jika: PDF memuat header instansi, periode, identitas pegawai, dan tabel capaian; Angka PDF konsisten dengan XLSX dan ringkasan_json untuk pegawai yang sama; Unduhan PDF memakai signed URL
- [x] t31 · Kunci Periode + read-only + trigger rekap final (FR-46) (M)
  - Butuh: t28
  - Kerjakan: Implementasi POST /api/periode/:id/kunci (ADMIN, PIMPINAN) yang mengubah status periode ke DIKUNCI, menyimpan dikunci_oleh/dikunci_at, dan memicu generate rekap final otomatis. Pastikan seluruh POST/PATCH/DELETE pada entri, bukti, dan alokasi dalam periode DIKUNCI ditolak di level server (409) dengan pesan Bahasa Indonesia, bukan hanya disembunyikan di UI. Tulis AuditLog aksi KUNCI_PERIODE.
  - Selesai jika: Setelah DIKUNCI, semua POST/PATCH/DELETE entri/bukti/alokasi periode tersebut ditolak (uji via API langsung); Kunci periode otomatis memicu generate rekap final dan AuditLog KUNCI_PERIODE tercatat; Status DIKUNCI membuat UI menonaktifkan tombol edit/hapus terkait
- [x] t32 · Arsip rekap berversi + unduhan ZIP bukti dukung (FR-47, FR-48) (M)
  - Butuh: t29, t31
  - Kerjakan: Pastikan setiap generate ulang menambah kolom versi dan tidak menimpa file versi lama (object_key memuat versi), simpan digenerate_oleh dan waktu. Implementasi GET /api/rekap/:periodeId/bukti-zip?userId= yang membangun ZIP memakai archiver berisi seluruh bukti dukung satu pegawai dalam satu periode, terstruktur folder per tanggal dan per alokasi, dengan batas maksimum 500 MB per unduhan (tolak dengan pesan jelas bila melebihi). Unduhan lewat signed URL.
  - Selesai jika: Generate ulang menghasilkan versi bertambah dan file versi lama tetap bisa diunduh; ZIP berisi struktur folder per tanggal dan per alokasi yang benar untuk 1 pegawai uji; Permintaan ZIP > 500 MB ditolak dengan pesan Bahasa Indonesia yang jelas
