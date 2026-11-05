# Dashboard Pekerjaan Harian & Rekap SKP — BPS Kabupaten Kerinci

Pencatatan pekerjaan harian pegawai, verifikasi ketua tim, dashboard capaian, dan rekap SKP bulanan (XLSX/PDF) dengan arsip berversi dan ZIP bukti dukung.

Stack: Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Auth.js v5 · Prisma 7 (driver adapter `pg`) + PostgreSQL 16 · MinIO (S3) · pg-boss (antrean rekap & pengingat).

Prisma 7: URL database dibaca dari `prisma.config.ts` (bukan `schema.prisma`) dan CLI tidak lagi memuat `.env` sendiri — `prisma.config.ts` memuatnya bila ada. Semua kode membuat klien lewat `buatPrisma()` di `lib/prisma-klien.ts`.

## Menjalankan dengan Docker (semua layanan)

```bash
cp .env.example .env        # ganti NEXTAUTH_SECRET dan ADMIN_PASSWORD
docker compose up -d --build
docker compose run --rm -e ADMIN_NIP=198001012005011001 -e ADMIN_NAMA=Administrator -e ADMIN_PASSWORD='<password-kuat>' migrate npx tsx prisma/seed.ts   # admin awal
```

Buka http://localhost:3000. Layanan: `postgres` (host 15432), `minio` (9000/9001), `migrate` (sekali jalan), `app` (3000), `worker` (pembuat rekap).
`S3_PUBLIC_ENDPOINT` harus alamat storage yang dapat dijangkau **browser** (dipakai menandatangani URL unduhan).

## Pengembangan lokal

```bash
docker compose up -d postgres minio
npm ci && npx prisma migrate deploy && npm run seed
npx tsx scripts/seed-demo.ts   # opsional: data demo (password Demo-12345)
npm run dev                    # terminal 1
npm run worker                 # terminal 2 (wajib agar rekap selesai)
```

## Tampilan

UI berbasis shadcn/ui dengan gaya "Bionis": sidebar yang bisa diciutkan ke ikon (laci geser di HP), topbar berisi judul halaman, notifikasi, dan menu profil, kartu abu-abu lembut, font Geist. Mode terang default; mode gelap lewat tombol di sidebar (disimpan di `localStorage`). Token ada di `app/globals.css`; token lama (`brand-*`, `ink-*`, `panel`, dst.) dipetakan ke token shadcn sehingga berlaku di kedua mode. Komponen shadcn ada di `components/ui/`.

## Deploy (Render + Neon + Cloudflare R2)

- **Database**: Neon (PostgreSQL 16, region Singapura) → `DATABASE_URL`. Jalankan `npx prisma migrate deploy` dan `npm run seed` sekali dari komputer lokal terhadap database itu.
- **Aplikasi**: Render web service (runtime Node, region Singapura). Build `npm ci && npm run build`, start `npm start`. Set `JOBS_INLINE=1` agar job rekap dijalankan di proses web (tanpa worker terpisah).
- **Penyimpanan bukti**: Cloudflare R2 (S3-kompatibel) → `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT` (keduanya `https://<account-id>.r2.cloudflarestorage.com`), `S3_REGION=auto`, `S3_KEY`, `S3_SECRET`, `S3_BUCKET`.
- `NEXTAUTH_SECRET` (acak ≥32 karakter) dan `NEXTAUTH_URL` (alamat produksi).
- **Pengingat harian 08.00 WIB**: dengan worker (Docker) terjadwal otomatis lewat pg-boss. Di Render tanpa worker, isi `CRON_SECRET` (acak ≥16 karakter) di aplikasi, lalu isi secret repo GitHub `APP_URL` dan `CRON_SECRET` agar workflow `.github/workflows/pengingat.yml` memanggil `POST /api/pengingat` tiap hari kerja (alternatif: Render Cron Job / layanan cron eksternal dengan header `Authorization: Bearer <CRON_SECRET>`). Pemicu ganda aman (idempoten).
- Opsional: `STORAGE_KUOTA_GB` (mis. `10` untuk R2 gratis) untuk indikator kuota di Admin → Periode; `TRUSTED_PROXY_HOPS` (bawaan 1) bila ada lebih dari satu proxy di depan aplikasi.
- Paket gratis Render tertidur setelah 15 menit tanpa trafik; permintaan pertama sesudahnya butuh sekitar satu menit.

## Pengujian

```bash
npm run test                   # unit (Vitest)
DATABASE_URL=postgresql://padeknian:padeknian@127.0.0.1:15432/padeknian_e2e npm run test:e2e
```

Database E2E wajib bernama `*e2e*` (di-reset otomatis). Playwright memakai Edge; ganti dengan `E2E_CHANNEL=chromium`.

## Layer pengguna: Beranda dan Lapor Event

- `/beranda` (pegawai dan ketua tim, halaman pertama setelah login): sapaan, status pencatatan hari ini, kartu aksi cepat (Catat pekerjaan hari ini → `/hari-ini?catat=1`, Lapor event → `/event?baru=1`, Lihat revisi, Kalender, Verifikasi untuk ketua), ringkasan angka, progres alokasi, dan aktivitas terbaru.
- `/event`: laporan kegiatan (jenis rapat/pelatihan/survei lapangan/lainnya, tanggal mulai-selesai, lokasi, peran, uraian hasil, dan hingga 10 lampiran dokumentasi di storage S3). Event dicatat per pegawai, **tidak diverifikasi dan tidak masuk rekap SKP**. Ketua tim membaca event anggotanya di tab "Event tim" (sesuai keanggotaan per periode); pimpinan dan admin tidak memiliki akses. Ubah/hapus hanya oleh pemilik selama periode belum dikunci. Event butuh periode yang memuat tanggal mulainya dan tidak boleh bertanggal masa depan.
- API: `GET|POST /api/event`, `GET|PATCH|DELETE /api/event/:id`, `POST /api/event/:id/lampiran`, `DELETE /api/event-lampiran/:id`, `GET /api/event-lampiran/:id/download`.

## Akun dummy untuk uji coba

`npm run seed:dummy` membuat 2 ketua tim dan 4 pegawai (tanpa tim, agar admin bisa mencoba membuat tim sendiri) dan mengaktifkan periode bulan berjalan bila belum ada periode aktif. Bawaannya dry-run; tidak ada password bawaan.

```bash
DUMMY_PASSWORD='<password>' npx tsx scripts/seed-pengguna-dummy.ts          # dry-run
DUMMY_PASSWORD='<password>' npx tsx scripts/seed-pengguna-dummy.ts --ya     # tulis
npx tsx scripts/seed-pengguna-dummy.ts --nonaktifkan --ya                    # nonaktifkan akun dummy setelah uji
```

Skrip menolak database bernama `*e2e*`, melewati NIP yang sudah ada (idempoten), dan tidak mengubah periode yang DIKUNCI atau mengganti periode aktif lain. Keanggotaan tim berlaku per periode: tambahkan anggota untuk periode aktif agar ketua melihat event dan catatan mereka.

## Tim Saya, Audit Log, dan fitur per peran

- `/tim-saya` (Pegawai dan Ketua Tim): tim yang diikuti pada periode terpilih beserta anggotanya. Ketua tim ditandai label "Ketua tim" dan warna kuning; akun sendiri ditandai "Anda". Untuk tim yang dipimpinnya, ketua dapat menambah/mengeluarkan anggota periode yang belum dikunci (otorisasi tetap di `POST /api/tim/:id/anggota`).
- `/admin/audit-log` dan `GET /api/audit-log?aksi=&q=&dari=&sampai=&page=` (Admin): jejak login, perubahan akun/peran, reset password, verifikasi, alokasi, kunci periode, dan unduhan arsip; tanggal dibaca dalam WIB.
- Tabel "Ringkasan per pegawai" di dashboard dapat dicari dan diurutkan, dan tampil bertahap per 50 baris; halaman Rekap dapat dicari per nama/NIP/tim.
- Insight "belum mengisi" dan "di bawah 50%" di Informasi Pegawai hanya menghitung akun aktif berperan Pegawai/Ketua Tim (Admin dan Pimpinan tidak wajib mencatat).
- `/rekap-saya` (Pegawai dan Ketua Tim): rekap SKP terbaru milik sendiri per periode (Final/Sementara), ringkasan hari terisi, catatan disetujui, bukti, dan capaian per alokasi, serta unduhan PDF. Unduhan PDF rekap boleh untuk pemiliknya; XLSX (berisi seluruh pegawai) tetap khusus Admin/Pimpinan.
- Admin dapat membuka Dashboard pemantauan (cakupan seluruh tim, sama seperti Pimpinan).
- Beranda Admin (Informasi Pegawai): tab "Pemantauan harian" dengan pilihan metrik per hari kerja berjalan (kepatuhan pengisian % dengan acuan 80%, catatan masuk, % catatan sudah disetujui, % catatan berbukti dukung) yang dapat ditampilkan sebagai batang atau garis (pilihan diingat per perangkat); hari kerja tanpa pengisi tetap tampil. Tab lain: "Perlu diingatkan" (12 pegawai dengan hari terisi paling sedikit) dan "Status verifikasi".

## Pengingat, keamanan, PWA, dan bantuan

- **Pengingat harian** (`lib/pengingat.ts`): tiap hari kerja, notifikasi in-app ke anggota/ketua tim aktif yang belum mencatat pekerjaan pada hari kerja sebelumnya (melewati akhir pekan & libur, hanya periode AKTIF); tautannya membuka form catat dengan tanggal itu. Admin dapat memicu manual di tab "Perlu diingatkan".
- **Kunci login**: 5 gagal per pasangan akun+IP (penyerang dari IP lain tidak mengunci pemilik akun), 30 per akun dari banyak IP, 100 per IP. IP diambil dari proxy tepercaya (`TRUSTED_PROXY_HOPS`).
- **Kecepatan verifikasi** di Dashboard: antrean, median lama menunggu, catatan paling lama menunggu (merah > 3 hari), dan median sampai verifikasi pertama, per tim/ketua.
- **Halaman di luar peran** mengembalikan HTTP 403 (`forbidden()` + `app/(app)/forbidden.tsx`).
- **PWA**: `app/manifest.ts` + `public/sw.js` (offline shell). Hanya aset statis yang di-cache; halaman/API berisi data pegawai tidak disimpan di perangkat.
- **Bantuan** (`/bantuan`, dari menu profil): panduan per peran.
- **Pemakaian penyimpanan** (Admin → Periode): ukuran bukti dan lampiran per periode.

## Dashboard & profil pegawai

- `/dashboard` (Ketua Tim, Pimpinan, Admin): KPI, tren pengisian harian, sebaran status verifikasi, kepatuhan per tim, peta kepatuhan (pegawai × hari kerja), dan ringkasan per pegawai. Data awal dirender di server.
- `/dashboard/pegawai/[id]?periodeId=`: profil pegawai berisi kepatuhan, kalender pengisian, progres alokasi, riwayat 6 periode, dan daftar catatan. Ketua Tim hanya dapat membuka profil anggota timnya.
- `GET /api/dashboard?periodeId=&timId=&userId=` mengembalikan `{ ringkasan, tabel, analitik }` dalam satu respons (cakupan dihitung sekali). Endpoint lama `/api/dashboard/ringkasan` dan `/api/dashboard/pegawai` tetap tersedia.
- Grafik dibuat dengan HTML/SVG tanpa pustaka tambahan dan tetap berjalan offline.

## Operasional

- **Backup**: `docker compose exec postgres pg_dump -U padeknian padeknian | gzip > backup-$(date +%F).sql.gz`; bucket MinIO (`miniodata`) dicadangkan dengan `mc mirror` atau snapshot volume.
- **Restore**: `gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U padeknian padeknian`.
- **Uji pemulihan (wajib sebelum go-live, lalu berkala, mis. tiap bulan setelah tutup periode)**: `scripts/uji-pemulihan.sh` mencadangkan database sumber (`pg_dump` format custom), memulihkannya ke database sekali pakai yang namanya harus mengandung `pulih`, lalu membandingkan jumlah baris tabel penting. Skrip menolak tujuan yang sama dengan sumber.

  ```bash
  createdb padeknian_pulih_uji   # di Postgres lokal/Docker
  SUMBER_URL="$DATABASE_URL" TUJUAN_URL=postgresql://padeknian:padeknian@127.0.0.1:15432/padeknian_pulih_uji bash scripts/uji-pemulihan.sh
  DATABASE_URL=postgresql://padeknian:padeknian@127.0.0.1:15432/padeknian_pulih_uji npx prisma migrate status   # harus "up to date"
  ```

  `pg_dump` harus versi yang sama atau lebih baru dari server Neon. Simpan berkas `.dump` di luar Neon (mis. penyimpanan kantor) dan catat tanggal uji.
- **Neon (produksi)**: selain dump di atas, Neon dapat memulihkan database ke titik waktu tertentu dalam jendela riwayat paket Anda (cek batasnya di konsol Neon). Cara aman: buat *branch* dari titik waktu sebelum insiden, uji aplikasi terhadap branch itu, baru arahkan `DATABASE_URL` ke sana atau pulihkan branch utama. Dump bulanan tetap diperlukan karena jendela riwayat terbatas.
- **Bukti dukung (Cloudflare R2)**: cadangkan bucket secara berkala, mis. `rclone sync r2:<bucket> /cadangan/bukti`. Database hanya menyimpan kunci objek; tanpa salinan bucket, bukti tidak dapat dipulihkan.
- **Hitung ulang progres** bila agregat diduga tidak sinkron: `npm run progres:rebuild`.
- Migrasi memiliki `down.sql` per folder di `prisma/migrations/`.
- Sesi: maksimum 8 jam, 60 menit tanpa aktivitas. Mengganti password mengeluarkan sesi di perangkat lain (perangkat yang mengganti tetap masuk); reset password oleh admin mengeluarkan semua sesi pengguna itu (kolom `User.sesi_berlaku_sejak`). Penguncian periode bersifat permanen.
- Header keamanan (`next.config.ts`): `X-Frame-Options`/`frame-ancestors` (anti-clickjacking), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, dan HSTS bila `NEXTAUTH_URL` berawalan `https://`.
