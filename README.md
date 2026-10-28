# Dashboard Pekerjaan Harian & Rekap SKP — BPS Kabupaten Kerinci

Pencatatan pekerjaan harian pegawai, verifikasi ketua tim, dashboard capaian, dan rekap SKP bulanan (XLSX/PDF) dengan arsip berversi dan ZIP bukti dukung.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind v4 · Auth.js v5 · Prisma 6 + PostgreSQL 16 · MinIO (S3) · pg-boss (antrean rekap).

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
- Paket gratis Render tertidur setelah 15 menit tanpa trafik; permintaan pertama sesudahnya butuh sekitar satu menit.

## Pengujian

```bash
npm run test                   # unit (Vitest)
DATABASE_URL=postgresql://padeknian:padeknian@127.0.0.1:15432/padeknian_e2e npm run test:e2e
```

Database E2E wajib bernama `*e2e*` (di-reset otomatis). Playwright memakai Edge; ganti dengan `E2E_CHANNEL=chromium`.

## Dashboard & profil pegawai

- `/dashboard` (Ketua Tim, Pimpinan): KPI, tren pengisian harian, sebaran status verifikasi, kepatuhan per tim, peta kepatuhan (pegawai × hari kerja), dan ringkasan per pegawai. Data awal dirender di server.
- `/dashboard/pegawai/[id]?periodeId=`: profil pegawai berisi kepatuhan, kalender pengisian, progres alokasi, riwayat 6 periode, dan daftar catatan. Ketua Tim hanya dapat membuka profil anggota timnya.
- `GET /api/dashboard?periodeId=&timId=&userId=` mengembalikan `{ ringkasan, tabel, analitik }` dalam satu respons (cakupan dihitung sekali). Endpoint lama `/api/dashboard/ringkasan` dan `/api/dashboard/pegawai` tetap tersedia.
- Grafik dibuat dengan HTML/SVG tanpa pustaka tambahan dan tetap berjalan offline.

## Operasional

- **Backup**: `docker compose exec postgres pg_dump -U padeknian padeknian | gzip > backup-$(date +%F).sql.gz`; bucket MinIO (`miniodata`) dicadangkan dengan `mc mirror` atau snapshot volume.
- **Restore**: `gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U padeknian padeknian`.
- **Hitung ulang progres** bila agregat diduga tidak sinkron: `npm run progres:rebuild`.
- Migrasi memiliki `down.sql` per folder di `prisma/migrations/`.
- Sesi: maksimum 8 jam, 60 menit tanpa aktivitas. Penguncian periode bersifat permanen.
