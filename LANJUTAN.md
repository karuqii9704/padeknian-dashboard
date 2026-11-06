# Catatan lanjutan pekerjaan (handoff)

Branch: `claude/nifty-johnson-5ek23v`. Dokumen ini untuk melanjutkan sesi yang terhenti karena batas waktu.
Hapus berkas ini setelah semua butir di bawah selesai.

## Sudah selesai & ter-push (semua terverifikasi tsc, lint, unit, E2E penuh)

Audit keamanan, sesi dicabut saat ganti password, header keamanan, Tim Saya, Audit Log, Rekap Saya,
Dashboard untuk Admin, pemantauan harian (metrik + batang/garis) di beranda Admin dan Dashboard,
pengingat harian (in-app + jadwal pg-boss + workflow GitHub + tombol Admin), kunci login per akun+IP,
kecepatan verifikasi, skrip uji backup-restore, PWA, halaman Bantuan, pemakaian storage, HTTP 403
(`forbidden()`), upgrade Next.js 16.4.5 dan Prisma 7.10.1. Lihat `git log` dan README.

## Sedang dikerjakan: rapikan peringatan React Compiler (tugas A)

Commit WIP terakhir berisi refaktor yang **lolos tsc, lint (0 error), dan 218 unit test, tetapi BELUM
diuji E2E**. Yang sudah diubah:

- `hooks/use-penyimpanan-lokal.ts` (baru): nilai localStorage via `useSyncExternalStore`.
- `app/theme.tsx`, `hooks/use-mobile.ts`, `app/login/page.tsx`, `app/(app)/pemantauan-harian.tsx`:
  baca localStorage/DOM tanpa setState di efek.
- `alokasi-form.tsx`, `event-form.tsx`, `entri-form.tsx`: `watch()` -> `useWatch()`.
- `grafik-pegawai.tsx`: offset donat dihitung di muka (tanpa mutasi saat render).
- `use-antrean-bukti.ts`: `ref.current = items` dipindah ke efek.
- `salin-dialog.tsx` + `alokasi-client.tsx`: dialog dipasang hanya saat dibuka (tanpa reset state di efek).
- `event-client.tsx`: tab "Event tim" dimuat di handler klik, bukan efek.
- `kalender-client.tsx`: tanggal dari `useSearchParams`; catatan disimpan bersama tanggalnya.
- `notifikasi-bell.tsx`, `panel-anggota.tsx`: setState hanya di callback `.then`.
- `verifikasi-client.tsx`: pilihan yang hilang dari antrean diturunkan via `useMemo`.

Sisa 2 peringatan (`npx eslint .`):

1. `app/(app)/dashboard/dashboard-client.tsx:178` —
   `useEffect(() => setBatas(LANGKAH_TABEL), [tabel, cari, urut])`. Ganti: reset `setBatas(LANGKAH_TABEL)`
   di handler `onChange` input cari & select urut, dan di tempat `setData(body)` (callback fetch).
2. `app/(app)/alokasi/alokasi-form.tsx:70` — efek baru terdeteksi setelah `useWatch`; lihat isinya dan
   pindahkan setState ke handler atau turunkan nilainya saat render.

Setelah 0 peringatan: ubah 4 aturan di `eslint.config.mjs` (`react-hooks/set-state-in-effect`,
`immutability`, `refs`, `incompatible-library`) dari `"warn"` kembali ke bawaan (hapus blok `rules`).

**Wajib sebelum dianggap selesai**: jalankan E2E penuh (lihat "Cara menjalankan E2E lokal"). Area berisiko
dari refaktor ini: tema gelap/terang, login "ingat saya", salin alokasi, tab Event tim, kalender
`?tanggal=`, lonceng notifikasi, Setujui terpilih, unggah bukti, pemantauan harian (pilihan tersimpan).

## Belum dikerjakan

- **B. Advisory moderate** (`npm audit --omit=dev`: archiver -> readdir-glob -> minimatch; exceljs -> uuid).
  Coba `"overrides"` di package.json (`minimatch` versi tanpa celah untuk readdir-glob, `uuid` >= 11.1.1 untuk
  exceljs), lalu jalankan E2E `rekap-xlsx`, `arsip-zip`, `dashboard-ekspor`. Batalkan bila ada yang gagal.
- **C. Pengingat lewat email (opsional)**: kirim email bila `SMTP_HOST` (dll.) diatur dan pengguna punya
  email, dari `lib/pengingat.ts` (setelah notifikasi in-app dibuat). Tambah `nodemailer`, kirim bertahap
  (jangan sekaligus ratusan), catat jumlah terkirim di audit log, uji dengan SMTP lokal (mis. `python -m
  aiosmtpd -n -l :1025`). Dokumentasikan env di `.env.example` dan README.
- **D. Verifikasi akhir**: tsc, lint, unit, E2E penuh, `npm audit --omit=dev`, perbarui README, hapus
  `LANJUTAN.md`, commit & push.

## Cara menjalankan E2E lokal (lingkungan cloud ini)

PostgreSQL 16 & emulator S3 (`moto_server`, `pip install "moto[server]"`) bisa mati sendiri; nyalakan dulu:

```bash
pg_lsclusters | grep -q online || pg_ctlcluster 16 main start
curl -s -o /dev/null localhost:9000/ || (nohup moto_server -p 9000 >/tmp/moto.log 2>&1 &)
```

Database `padeknian_e2e` (user/password `padeknian`) sudah dibuat. Playwright proyek tidak cocok dengan
Chromium bawaan; buat `playwright.local.config.ts` (sudah di `.git/info/exclude`, jangan di-commit):

```ts
import base from "./playwright.config";
export default { ...base, use: { ...base.use, channel: undefined, launchOptions: { executablePath: "/opt/pw-browsers/chromium" } } };
```

```bash
DATABASE_URL=postgresql://padeknian:padeknian@127.0.0.1:5432/padeknian_e2e \
NEXTAUTH_SECRET=ci-secret-ci-secret-ci-secret-ci-secret CRON_SECRET=ci-cron-secret-ci-cron-secret \
npx playwright test -c playwright.local.config.ts
```

Hasil baseline terakhir: 151 lolos, 1 gagal **yang diharapkan** — `e2e/bukti.spec.ts:129` (signed URL
kedaluwarsa) karena moto tidak menegakkan kedaluwarsa; di CI (MinIO) test ini lolos. 3 test sesudahnya di
file yang sama ikut "did not run".

## Catatan deploy (untuk pemilik proyek)

- `npx prisma migrate deploy` (migrasi baru: `sesi_berlaku_sejak`, `login_attempt_ip`).
- Render: Node >= 20.19 (Prisma 7). Isi `CRON_SECRET`; secret GitHub `APP_URL` + `CRON_SECRET` untuk
  workflow pengingat. Opsional `STORAGE_KUOTA_GB`, `TRUSTED_PROXY_HOPS`.
- Uji pemulihan terhadap Neon produksi dengan `scripts/uji-pemulihan.sh` (baru diuji lokal).
