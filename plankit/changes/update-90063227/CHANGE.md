<!-- plankit project:90063227-09b2-4ca9-ad4b-7eae2e28eca8 | managed file: keep task ids, only edit the [ ] markers and Note lines -->

# Redesign UI/UX Dashboard BPS Kerinci: Design System, Permukaan per Peran, dan Penguatan E2E

## 1. Ringkasan

Redesign antarmuka `app/` (93 file) pada Next.js 15.5.27 + React 19.1.0 + Tailwind CSS 4.3.3 supaya tiap peran (`PEGAWAI`, `KETUA_TIM`, `PIMPINAN`, `ADMIN`) mendapat permukaan yang sesuai pekerjaannya, bukan satu UI generik yang dipakai semua orang. Porsi keempat peran sama rata, tapi bentuknya berbeda: pegawai/mitra mendapat **mode ringkas** (unggah bukti + update progres saja), Ketua Tim mendapat **antrean verifikasi dan tabel kerja**, Pimpinan mendapat **dashboard KPI**, Admin mendapat **tabel master data**.

Fondasi teknisnya: token tema di `app/globals.css` via `@theme` [verify], satu set komponen primitif di `components/ui/`, dan app shell dengan navigasi yang dirender dari `Role` di sesi. Alur submit entri dan alur verifikasi **tidak diubah perilakunya** — hanya dibungkus ulang secara visual.

Saat ini tidak ada satupun library komponen/ikon yang terpasang, `public/` hanya berisi 5 aset starter Next.js, dan 28 spec Playwright menguji lewat UI sehingga markup baru berisiko memecahkannya. Change ini karena itu memasukkan perbaikan selector e2e sebagai pekerjaan wajib, bukan efek samping.

## 2. Kondisi Saat Ini

Semua di bawah ini dari konteks yang diberikan; yang bukan dari sana ditandai `[verify]`.

**Runtime & build**
- `Dockerfile`: `FROM node:22-alpine` (versi mayor dari image, bukan lockfile), stage `deps → builder → tools → runner`, output standalone.
- TypeScript 5.9.3, `tsconfig.json` `strict: true`, `target: ES2017`, alias `@/* → ./*`.
- Next.js 15.5.27 (App Router) + `@tailwindcss/postcss` 4.3.3.
- React 19.1.0, React DOM 19.1.0.

**UI**
- Tailwind CSS 4.3.3. Tidak ada `tailwind.config.*` di tree → konfigurasi CSS-first, tema kemungkinan di `app/globals.css` [verify].
- `geist` 1.7.2 sebagai font.
- **Tidak ada** library komponen/headless UI: tidak ada shadcn, Radix, Headless UI, Heroicons, lucide, dsb. Komponen UI kemungkinan besar dibangun tangan dari primitif Tailwind [verify].
- `public/` hanya 5 SVG starter: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`. Manifest/ikon PWA tidak terlihat di tree [verify: bisa jadi ada di `app/`].

**Data, storage, async**
- `@prisma/client` 6.19.3 / `prisma` 6.19.3, PostgreSQL 16 (`postgres:16-alpine`), MinIO `bitnamilegacy/minio:2025.7.23-debian-12-r3`, `@aws-sdk/client-s3` 3.1147.0 + `lib-storage` + `s3-request-presigner`, `file-type` 22.1.1.
- `pg-boss` 12.37.0 untuk rekap asinkron di `worker/index.ts` (tanpa Redis). `exceljs` 4.4.0, `@react-pdf/renderer` 4.9.0, `archiver` 8.0.0, `pino` 10.4.0.
- Auth: `next-auth` 5.0.0-beta.32, `bcryptjs` 3.0.3, `zod` 4.6.5, `react-hook-form` 7.89.0, `@hookform/resolvers` 5.9.1. Konfigurasi di `auth.ts`, `auth.config.ts`, `middleware.ts`, augmentasi sesi di `types/next-auth.d.ts`.
- `prisma/schema.prisma`: 16 model + 11 enum, PK `uuid` (kecuali `AuditLog`/`LoginAttempt` `BigInt` autoincrement). Enum relevan UI: `Role`, `StatusPeriode` (`DRAFT`/`AKTIF`/`DIKUNCI`), `Prioritas`, `StatusAlokasi`, `StatusPekerjaan`, `StatusVerifikasi` (`MENUNGGU`/`DISETUJUI`/`MINTA_REVISI`/`DITOLAK`), `AksiVerifikasi`, `TipeNotifikasi`, `StatusRekap` (`QUEUED`/`PROSES`/`SELESAI`/`GAGAL`).
- Agregat `Alokasi.realisasi`/`menunggu`/`persen` dan `PenugasanAlokasi` didenormalisasi, dikomentari selalu dihitung ulang oleh `recalculateProgresAlokasi` (`lib/progres-alokasi.ts`, isi belum terlihat).
- `RekapSKP` berversi (`@@unique([periodeId, userId, versi])`, `batchId`, `isFinal`). `BuktiDukung` punya `@@unique([pekerjaanHarianId, checksumSha256])`, `objectKey` unik.
- Akses file lewat signed URL; `S3_PUBLIC_ENDPOINT` dipakai menandatangani URL yang dijangkau browser. Masa berlaku ≤15 menit per PRD FR-29 [verify: implementasi di `lib/`].

**Tooling & test**
- `@playwright/test` 1.64.0 (28 spec di `e2e/`), `vitest` 5.0.3, `eslint` 9.39.5 + `eslint-config-next` 15.5.27, `tsx` 4.23.15, `adm-zip` 0.6.1, `unpdf` 1.8.1.
- `e2e/` berisi spec alur inti (`entri`, `verifikasi`, `alokasi`, `rekap-*`, `bukti-*`, `kunci-periode`, `salin`, `dashboard-*`) plus `e2e/support/{api,auth,data,data-besar}.ts` dan `global-setup.ts` (reset DB E2E). Isi spec tidak disertakan, jadi jenis selector-nya belum diketahui [verify].
- `prisma/migrations/` 29 folder, tiap folder punya `migration.sql` **dan** `down.sql`.
- `scripts/rebuild-progres.ts` (`npm run progres:rebuild`), `scripts/seed-demo.ts` (password `Demo-12345`), `prisma/seed.ts` (admin dari env `ADMIN_*`).
- `plankit/PRD.md` (terpotong di 46.088 byte) + `plankit/TASKS.md`. PRD §9 Usabilitas mengikat: bahasa Indonesia penuh, responsive ≥360 px, target sentuh ≥44×44 px, kontras WCAG 2.1 AA, p95 muat ≤2,0 detik.
- `tsconfig.tsbuildinfo` dan `test-results/.last-run.json` terlihat di tree [verify: status tracking git, `.gitignore` tidak disertakan].

**Relevan langsung untuk perubahan ini**
- `app/` (93 file) — seluruh halaman & komponen UI; isi per-file belum terlihat [verify].
- `app/globals.css` [verify] — titik termurah mengubah look & feel.
- `app/layout.tsx` [verify] — tempat `geist`, metadata, dan shell navigasi dipasang.
- `postcss.config.mjs` — plugin `@tailwindcss/postcss` 4.3.3.
- `package.json` — kalau menambah ikon/library komponen/font.
- `lib/` (84 file) — helper format tanggal (WIB/`Asia/Jakarta`), angka, satuan [verify].

## 3. Tujuan Perubahan

**Untuk siapa:** seluruh pegawai BPS Kabupaten Kerinci yang memakai empat peran, tanpa peran yang diprioritaskan di atas yang lain.

**Perubahan perilaku yang diminta (dari jawaban klarifikasi):**
1. **Interface berbeda per jenis akun.** Navigasi, kepadatan informasi, dan halaman pendarat berbeda antara `PEGAWAI`, `KETUA_TIM`, `PIMPINAN`, `ADMIN`.
2. **Mode ringkas untuk pegawai/mitra.** Pegawai yang cakupan kerjanya terbatas cukup mengakses dua hal: **unggah bukti dukung** dan **update progres**. Keduanya harus bisa diselesaikan tanpa melewati menu lain.
3. **Alur submit entri dan alur verifikasi tetap utuh** — boleh berubah tampilannya, tidak boleh berubah urutan langkah, payload, maupun efek datanya.
4. **Refactor besar diizinkan**, termasuk menambah library komponen.

**Acceptance terukur** (user melewati pertanyaan kriteria sukses, jadi ini ditetapkan di sini sebagai kontrak):
- Entri harian oleh pegawai/mitra selesai dalam **≤3 langkah** dari halaman pendarat perannya, pada viewport 360 px, tanpa scroll horizontal.
- Setiap peran melihat **hanya** menu yang relevan untuk perannya; menu non-relevan tidak dirender (bukan hanya di-disable).
- Unggah bukti dukung: file terpilih tampil sebagai pratinjau + progress + status, dan kegagalan menampilkan pesan error dari server apa adanya (bukan pesan generik).
- Dashboard Ketua Tim & Pimpinan: KPI periode berjalan + antrean menunggu verifikasi terlihat dalam satu layar 1366×768 tanpa scroll.
- Tabel daftar (alokasi/pekerjaan/verifikasi) punya filter status verifikasi dan filter periode, dan state filter tersimpan di URL query param.
- Kontras seluruh pasangan warna teks/latar memenuhi **WCAG 2.1 AA**; target sentuh ≥44×44 px; Lighthouse aksesibilitas **≥95** di 5 rute utama (target ini ditetapkan di sini karena tidak diberikan user) [verify: lingkungan ukur Lighthouse].
- p95 muat ≤2,0 detik pada rute utama sesuai PRD §9 [verify: baseline belum diukur].
- Seluruh 28 spec Playwright di `e2e/` hijau setelah redesign; jumlah spec boleh bertambah, tidak boleh berkurang.
- Tidak ada string berbahasa Inggris yang tersisa di antarmuka.

## 4. Business Case & Go/No-Go

### Estimasi biaya

| Item biaya | Estimasi | Basis |
|---|---|---|
| Desain token tema + komponen primitif `components/ui/` | 5 person-day | 5 item CH di Change 1 + spike 0,5 hari untuk memastikan library komponen kompatibel dengan Tailwind 4.3.3 [estimate] |
| App shell + navigasi per peran + PWA | 3 person-day | Change 2; `app/layout.tsx` + `components/shell/*` + manifest/ikon [estimate] |
| Mode ringkas pegawai/mitra (Change 3) | 4 person-day | Wizard 3 langkah + permukaan unggah bukti + halaman tugas saya [estimate] |
| Dashboard & tabel kerja Ketua Tim/Pimpinan/Admin | 3 person-day | KPI + tabel bersama + halaman admin [estimate] |
| Permukaan verifikasi Ketua Tim | 2 person-day | Antrean + panel detail + aksi [estimate] |
| Aksesibilitas & responsif (Change 6) | 3 person-day | Audit kontras, 360 px, zoom 200%, spec axe [estimate] |
| Perbaikan selector 28 spec e2e (Change 7) | 3 person-day | 28 spec × penyelarasan selector, isi spec belum terlihat [verify] |
| Cleanup + unit test pertama (Change 8) | 1,5 person-day | Hapus 5 aset starter, gitignore, `lib/status.test.ts` [estimate] |
| Review & QA manual 4 peran | 1,5 person-day | 1 sesi per peran × 4 [estimate] |
| **Total pekerjaan sekali jalan** | **26 person-day** (≈208 agent-hour) | Penjumlahan di atas; laju blended rate belum diketahui [verify] |
| **Biaya bulanan berjalan (tambahan)** | **Rp 0 + biaya runner CI** | Hosting, Postgres, MinIO sudah ada di `docker-compose.yml`; seluruh library yang diusulkan open source. Kenaikan menit runner CI Playwright belum diukur [verify] |

Dengan asumsi rate internal **Rp 600.000/person-day** [verify: tidak ada data biaya internal di konteks]:
- Biaya 12 bulan = Rp 15.600.000 (satu kali) + Rp 0 berjalan = **Rp 15.600.000**.

### Estimasi manfaat per bulan (biaya TIDAK melakukan perubahan)

- Penghematan waktu input: asumsi **40 pegawai aktif** [verify] × **20 menit/orang/bulan** [verify] = 13,3 jam/bulan × **Rp 60.000/jam** [verify] = **Rp 800.000/bulan** → Rp 9.600.000 per 12 bulan.
- Penurunan bolak-balik revisi verifikasi (entri ditolak karena bukti tidak jelas / salah field): belum ada angkanya di konteks [verify].
- Kepatuhan pada kontrak PRD §9 (360 px, target sentuh 44 px, WCAG AA, PWA installable, p95 ≤2,0 s): saat ini belum ada bukti terpenuhi, dan nilainya tidak bisa dirupiahkan dari data yang ada [verify].
- Pelunasan technical debt: 28 spec e2e yang seluruhnya menguji lewat UI akan pecah di setiap perubahan markup berikutnya. Tanpa Change 7, biaya itu berulang setiap rilis [verify: isi spec belum terlihat].
- ROI 12 bulan (hanya manfaat yang bisa dihitung) = (9.600.000 − 15.600.000) / 15.600.000 = **−38,5%**.
- Payback period = 15.600.000 / 800.000 = **≈19,5 bulan** [estimate, sangat sensitif terhadap asumsi jumlah pengguna dan rate].

Angka di atas negatif kalau hanya menghitung penghematan waktu. Dua alasan yang membuat plan ini tetap layak jalan sebagai perubahan berlingkup terkendali: (a) PRD §9 adalah kontrak produk yang sudah ditulis, bukan preferensi estetika; (b) Change 7 melunasi debt yang biayanya berulang. Namun karena seluruh input kuantitatif masih `[verify]`, persetujuan ini **dikondisikan** pada baseline Fase 1.

### Kill criteria

- [KILL-1] Baseline 28 spec e2e menunjukkan >30% (≥9 spec) sudah merah sebelum perubahan apa pun → stop, perbaiki baseline dulu, jangan mulai redesign. (dicek di akhir Fase 1)
- [KILL-2] Tambahan bundle JS klien pada rute utama >150 KB gzip **atau** p95 muat >2,0 detik setelah Change 1 → buang library komponen pihak ketiga, kembali ke primitif Tailwind buatan sendiri. (dicek di akhir Fase 1 dan Fase 2)
- [KILL-3] Setelah Fase 2, ada spec e2e yang masih merah karena markup dan tidak terperbaiki dalam satu siklus kerja → rollback Fase 2 ke tag `pre-ui-redesign`. (dicek di akhir Fase 2)
- [KILL-4] Waktu median penyelesaian entri harian oleh pegawai (diukur di Fase 3, sampel ≥5 pegawai) tidak turun ≥25% dibanding baseline Fase 1 → rescope: hentikan Fase 4, potong polish Change 4/5, sisakan fondasi + mode ringkas + a11y. (dicek di akhir Fase 3)
- [KILL-5] Pemakaian usaha aktual melewati 2× estimasi (>52 person-day) tanpa menyelesaikan Fase 2 → stop dan tinjau ulang lingkup. (dicek kontinu, dievaluasi di akhir Fase 2)

**Go/No-Go:** GO WITH CONDITIONS: (1) baseline Fase 1 wajib terkumpul sebelum Fase 2 dimulai — hasil 28 spec e2e, waktu entri/verifikasi manual, jumlah pengguna aktif per peran; (2) daftar dependensi UI harus disetujui dan di-pin versinya, dan build harus tetap jalan di CI tanpa akses jaringan saat runtime; (3) anggaran performa dipegang: p95 ≤2,0 s dan tambahan bundle ≤150 KB gzip; (4) kalau setelah angka jumlah pegawai dan rate diverifikasi ROI terukur tetap negatif, lingkup dipangkas otomatis ke Change 1 + 3 + 6 dan polish Change 4/5 ditunda ke plan terpisah.

## 5. Di Luar Cakupan

Jangan sentuh daftar ini, meskipun terlihat tidak rapi. Semuanya bekerja dan bukan bagian dari permintaan.

- **`prisma/schema.prisma` dan `prisma/migrations/**`.** Tidak ada perubahan model, enum, atau migrasi baru. Tidak ada migrasi destruktif.
- **`worker/index.ts`** dan seluruh antrean `pg-boss`. Format XLSX (`exceljs`), PDF (`@react-pdf/renderer`), dan ZIP (`archiver`) tidak berubah.
- **Aturan bisnis verifikasi.** State machine `StatusVerifikasi` (`MENUNGGU`/`DISETUJUI`/`MINTA_REVISI`/`DITOLAK`), sifat append-only `Verifikasi`, dan trigger database-nya tidak diubah.
- **`recalculateProgresAlokasi` (`lib/progres-alokasi.ts`)** dan agregat `Alokasi`/`PenugasanAlokasi`. UI membaca, bukan menghitung.
- **Auth & otorisasi.** `auth.ts`, `auth.config.ts`, `middleware.ts`, `types/next-auth.d.ts` — UI role-aware bersifat kosmetik, bukan kontrol keamanan. Mengeja ulang aturan otorisasi di komponen klien = pengerjaan ulang yang berbahaya.
- **`docker-compose.yml`, `Dockerfile`, `.env.example`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`.** Temuan di file-file ini dicatat sebagai `[DEBT-n]`, bukan diperbaiki di sini.
- **Ganti font.** Tetap `geist` 1.7.2. Tidak menambah font baru (risiko CLS + bundle).
- **Dark mode.** Token tema disiapkan agar dark mode murah ditambahkan nanti, tapi tidak diimplementasikan di plan ini.
- **`scripts/**`** (`rebuild-progres.ts`, `seed-demo.ts`) dan **`prisma/seed.ts`**. Kalau butuh data uji baru, pakai `e2e/support/data.ts`, jangan ubah seeder.
- **Migrasi ke e-Kinerja/SIKEP/SIMPEG, tanda tangan digital, aplikasi mobile native** — sudah di luar cakupan produk (PRD §5).
- **Mengubah URL rute.** Path rute tetap sama; bookmark dan spec e2e bergantung padanya.

## 6. Perubahan

### Change 1 — Fondasi token tema dan komponen primitif

**Fase:** 1 · **Prioritas:** Must

Satu sumber kebenaran visual: token di `app/globals.css`, primitif di `components/ui/`, dan aturannya ditulis di `design-system/MASTER.md`. Tanpa langkah ini, redesign akan jadi tambalan per halaman dan langsung berantakan.

- [CH-1] Di `app/globals.css` [verify: tema saat ini ada di sini], definisikan token lewat `@theme`: skala warna netral + warna merek, 4 radius, skala spacing, ukuran teks (minimum 14 px untuk body), ketinggian kontrol (44 px), dan warna per status. Hapus nilai warna hardcoded yang tersebar di `app/`.
- [CH-2] Di `package.json`, tambahkan dependensi UI yang benar-benar dipakai saja, versi di-pin: `lucide-react` (ikon), `clsx` + `tailwind-merge` (penggabung class), `class-variance-authority` (varian), primitif Radix seperlunya (dialog, dropdown-menu, tabs, tooltip, select, checkbox), dan `sonner` (toast). Jangan tambah di luar daftar ini tanpa alasan yang tertulis di PR.
- [CH-3] Buat `components/ui/` (baru): `Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `StatusBadge`, `Card`, `Table` (header/body/row/cell), `Dialog`, `Tabs`, `Tooltip`, `Skeleton`, `EmptyState`, `Toast`. Semua memakai `forwardRef`, mendukung `disabled`/`loading`, punya nama aksesibel, dan punya `data-testid` yang bisa diturunkan pemanggil.
- [CH-4] Buat `design-system/MASTER.md` (baru): daftar token, aturan pemakaian komponen, konvensi `data-testid`, aturan label aksesibel, dan **peta tunggal status → label Indonesia + varian warna + ikon** untuk `StatusVerifikasi`, `StatusAlokasi`, `StatusPekerjaan`, `StatusRekap`, `StatusPeriode`, `Prioritas`.
- [CH-5] Buat `lib/status.ts` (baru) sebagai implementasi peta di CH-4, satu-satunya tempat label & warna status didefinisikan. [verify: `lib/` belum terlihat; kalau helper serupa sudah ada, jadikan CH-5 sebagai konsolidasi ke file itu, bukan duplikasi]

### Change 2 — App shell, navigasi per peran, dan PWA

**Fase:** 1 · **Prioritas:** Must

Kerangka yang sama untuk semua peran, isi menu yang berbeda. Ini yang mewujudkan "beda jenis akun beda jenis interface" pada jawaban klarifikasi.

- [CH-6] Tulis ulang shell di `app/layout.tsx` [verify]: sidebar tetap pada ≥1024 px, drawer/bottom-nav pada <1024 px, area konten dengan maksimum lebar baca, breadcrumb, dan skip-link "Lewati ke konten". Font tetap `geist`.
- [CH-7] Buat `components/shell/` (baru) — `AppShell`, `Sidebar`, `Topbar`, `RoleNav`, `UserMenu` — plus `lib/navigasi.ts` (baru) yang memetakan `Role` dari `types/next-auth.d.ts` ke daftar menu. Menu yang tidak relevan **tidak dirender**. Sembunyikan menu hanya kosmetik; otorisasi tetap di `middleware.ts`/`auth.config.ts`.
- [CH-8] Tambahkan breakpoint dan density ke shell: pada 360 px tidak boleh ada scroll horizontal, tidak ada tombol terpotong, dan setiap elemen interaktif ≥44×44 px.
- [CH-9] PWA: buat `public/manifest.webmanifest` + ikon 192/512 + maskable, dan pasang `manifest`, `theme-color`, serta `apple-touch-icon` di metadata `app/layout.tsx`. Ini juga menutup temuan "`public/` hanya aset starter".

### Change 3 — Mode ringkas Pegawai/Mitra

**Fase:** 2 · **Prioritas:** Must

Jalur kerja paling sering dipakai orang paling banyak: catat progres, unggah bukti, kirim. Permukaan lain disembunyikan dari pendarat peran ini.

- [CH-10] Ubah halaman entri harian (`app/**/page.tsx` — [verify: path pasti belum terlihat]) menjadi wizard 3 langkah: pilih alokasi → isi realisasi + catatan → unggah bukti → kirim. Server action/route handler yang dipanggil **tidak berubah signature maupun payload**; hanya markup dan urutan tampilan langkah yang berubah. Setelah kirim, tetap kembali ke daftar dengan status yang sama seperti sebelumnya.
- [CH-11] Buat `components/entri/` (baru): `Stepper`, `RingkasanAlokasi` (sticky, menampilkan nama kegiatan dan target), `FormRealisasi` (pakai `react-hook-form` + `zod` yang sudah terpasang), dan indikator status simpan.
- [CH-12] Bangun ulang permukaan unggah bukti dukung: area drag-and-drop, pratinjau gambar & PDF (pakai signed URL yang sudah ada, ≤15 menit), progress per file, tombol coba lagi saat gagal, dan pesan error dari server ditampilkan apa adanya. Validasi `file-type` tetap otoritatif di server; di klien hanya sebagai petunjuk awal.
- [CH-13] Buat halaman "Tugas Saya" sebagai pendarat `PEGAWAI`: daftar alokasi aktif dengan dua aksi cepat — "Catat progres" dan "Unggah bukti" — plus penanda alokasi yang belum ada entri hari ini.

### Change 4 — Dashboard & tabel kerja untuk Ketua Tim, Pimpinan, dan Admin

**Fase:** 2 · **Prioritas:** Must

Satu set komponen tabel dan KPI yang dipakai tiga peran dengan konfigurasi berbeda, sehingga tidak ada tiga implementasi berbeda yang harus dirawat.

- [CH-14] Susun baris KPI di atas lipatan untuk `PIMPINAN` dan `KETUA_TIM`: realisasi periode berjalan, jumlah pekerjaan `MENUNGGU` verifikasi, jumlah alokasi tanpa entri, dan status periode (`DRAFT`/`AKTIF`/`DIKUNCI`). Angka diambil dari data yang sudah ada; **tidak ada perhitungan baru di UI**.
- [CH-15] Buat `components/tabel/` (baru): `DataTable` dengan filter status verifikasi, filter periode/tim, pengurutan, pagination, header sticky, skeleton saat memuat, dan empty state yang menjelaskan langkah berikutnya. **State filter disimpan di URL query param** supaya bisa di-bookmark dan dibagikan.
- [CH-16] Terapkan `DataTable` + primitif `components/ui/` pada halaman `ADMIN` (user, tim kerja, periode, hari libur). Setiap aksi destruktif memakai `Dialog` konfirmasi dengan nama objek yang disebut eksplisit. Logika mutasi tidak berubah.

### Change 5 — Permukaan verifikasi Ketua Tim

**Fase:** 2 · **Prioritas:** Must

Membuat antrean verifikasi enak dipakai tanpa menyentuh aturannya. Ini salah satu dari dua alur yang user minta tetap utuh.

- [CH-17] Buat antrean verifikasi di halaman verifikasi (`app/**` — [verify: path pasti]): daftar pekerjaan `MENUNGGU` dengan ringkasan bukti, nama pegawai, kegiatan, dan tanggal. **Tanpa aksi massal** — verifikasi tetap satu per satu agar kontrak `Verifikasi` append-only dan `AksiVerifikasi` tidak berubah.
- [CH-18] Panel detail verifikasi: pratinjau bukti dukung, riwayat verifikasi ditampilkan read-only, dan form komentar + tiga aksi (`DISETUJUI`, `MINTA_REVISI`, `DITOLAK`) yang memanggil action/route yang sama seperti sekarang. Setelah aksi, tampilkan konfirmasi dan perbarui daftar.
- [CH-19] Samakan penyajian status: seluruh badge status memakai `StatusBadge` dari CH-3 dan peta dari CH-5, termasuk notifikasi hasil verifikasi.

### Change 6 — Aksesibilitas & responsif

**Fase:** 3 · **Prioritas:** Should

PRD §9 sudah mengikat angka-angka ini; fase ini yang membuktikannya, bukan sekadar mengklaimnya.

- [CH-20] Audit dan perbaiki kontras seluruh token dari CH-1 sampai memenuhi WCAG 2.1 AA, pastikan focus ring terlihat di latar terang dan gelap, dan pastikan `Dialog`/`Tabs`/`Tooltip` bisa dioperasikan penuh dengan keyboard.
- [CH-21] Audit pada 360 px, 768 px, 1024 px, dan 1440 px untuk setiap halaman utama: tidak ada scroll horizontal, tidak ada teks terpotong, dan layout tetap terbaca pada zoom 200%.
- [CH-22] Tambahkan `@axe-core/playwright` (dependensi baru, sebutkan alasannya di PR) dan buat spec a11y untuk 5 rute utama yang gagal kalau ada violation tingkat serious/critical.

### Change 7 — Selector e2e stabil dan perbaikan 28 spec

**Fase:** 2 · **Prioritas:** Must

Dikerjakan **sebelum** markup berubah besar-besaran, supaya kegagalan tes bisa dibedakan antara "memang rusak" dan "selector berubah". Ini item debt medium di temuan dan dikerjakan sekarang, bukan ditunda.

- [CH-23] Tetapkan konvensi `data-testid` di `design-system/MASTER.md` (pola: `<area>-<elemen>`, mis. `entri-langkah-2`, `tabel-verifikasi-baris`) dan terapkan pada seluruh komponen baru di `components/`.
- [CH-24] Rapikan `e2e/support/*.ts` dan 28 spec: ganti selector berbasis teks mentah ke `getByRole` dan `getByTestId`. **Jangan melonggarkan asersi**, jangan menambah `waitForTimeout`, dan jangan menonaktifkan spec.
- [CH-25] Jalankan 28 spec di setiap akhir fase dan catat hasilnya di deskripsi PR (jumlah lulus/gagal + nama spec yang gagal). Spec merah karena markup diperbaiki, bukan di-skip.

### Change 8 — Cleanup dan unit test pertama

**Fase:** 4 · **Prioritas:** Could

- [CH-26] Hapus `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` setelah dipastikan tidak ada referensi tersisa di `app/`.
- [CH-27] Perbaiki `.gitignore` dan keluarkan `tsconfig.tsbuildinfo` serta `test-results/.last-run.json` dari tracking (`git rm --cached`) — hanya kalau terbukti ter-track [verify: `.gitignore` tidak disertakan].
- [CH-28] Tambahkan unit test vitest pertama: `lib/status.test.ts` (peta status → label + warna) dan render test untuk minimal 3 komponen `components/ui/`. Pastikan `npm run test` benar-benar menjalankan tes, bukan lulus dengan nol tes.

## 7. Area Terdampak

| Path | Yang berubah | Risiko |
|---|---|---|
| `app/globals.css` | Token `@theme`, breakpoint, util, warna status [verify: lokasi tema] | medium |
| `app/layout.tsx` | Shell, navigasi, metadata PWA; font tetap `geist` | medium |
| `app/**/page.tsx` (halaman per peran) | Komposisi ulang markup & layout; tidak ada perubahan pemanggilan data | high |
| `app/api/**` (route handler yang ada) | **Tidak berubah** signature/payload; hanya dipastikan tetap dipanggil dari UI baru | low |
| `components/ui/*` (baru) | Primitif komponen | low |
| `components/shell/*` (baru) | Sidebar, topbar, navigasi per peran | low |
| `components/entri/*` (baru) | Stepper, form realisasi, permukaan unggah bukti | medium |
| `components/tabel/*` (baru) | Tabel data + filter berbasis URL query param | medium |
| `lib/status.ts` (baru) | Peta status → label/warna/ikon | low |
| `lib/navigasi.ts` (baru) | Peta `Role` → menu | low |
| `lib/**` lain | Hanya dibaca (helper format tanggal/angka/otorisasi); tidak diubah | low |
| `design-system/MASTER.md` (baru) | Kontrak desain & konvensi testid | low |
| `public/manifest.webmanifest`, `public/icon-*.png` (baru) | Aset PWA | low |
| `public/*.svg` (5 aset starter) | Dihapus di Fase 4 | low |
| `package.json`, `package-lock.json` | Dependensi UI baru (di-pin) | medium |
| `e2e/support/*.ts`, `e2e/*.spec.ts` | Selector jadi `getByRole`/`getByTestId`; asersi dipertahankan | high |
| `next.config.ts` | Hanya kalau manifest/metadata butuh penyesuaian [verify] | low |

## 8. Perilaku yang Harus Tetap

- [KEEP-1] Alur submit entri harian: urutan langkah, endpoint/action yang dipanggil, payload, dan transisi `StatusPekerjaan` tetap identik. Setelah submit, jumlah `Alokasi.menunggu` naik dan `Alokasi.realisasi` belum berubah, seperti sekarang.
- [KEEP-2] Alur verifikasi: tiga aksi (`DISETUJUI`, `MINTA_REVISI`, `DITOLAK`) tetap menulis baris `Verifikasi` secara append-only lewat jalur yang sama, tetap tercatat di `AksiVerifikasi`, dan tetap memicu trigger database. Tidak ada aksi massal baru.
- [KEEP-3] Agregat `Alokasi.realisasi`/`menunggu`/`persen` dan `PenugasanAlokasi` tetap dihitung ulang **hanya** oleh `recalculateProgresAlokasi`. UI tidak menghitung sendiri dan tidak menulis agregat.
- [KEEP-4] Akses bukti dukung tetap lewat signed URL dengan masa berlaku ≤15 menit, ditandatangani memakai `S3_PUBLIC_ENDPOINT` untuk URL yang dibuka browser.
- [KEEP-5] Otorisasi tetap ditegakkan di `middleware.ts` + `auth.config.ts`. Menyembunyikan menu di UI tidak menggantikan pengecekan server; akses langsung ke URL yang tidak diizinkan tetap ditolak.
- [KEEP-6] Rekap SKP tetap berversi (`RekapSKP` dengan `@@unique([periodeId, userId, versi])`), tetap diproduksi asinkron oleh `worker/index.ts` lewat `pg-boss`, dan tombol Generate tetap memicu job serta menampilkan `StatusRekap` (`QUEUED`/`PROSES`/`SELESAI`/`GAGAL`).
- [KEEP-7] Status periode tetap mengikat: saat `DIKUNCI`, tidak ada aksi tulis yang bisa dilakukan dari UI, dan saat `DRAFT` perilakunya tetap seperti sekarang.
- [KEEP-8] Unggah bukti tetap divalidasi magic bytes dengan `file-type` di server dan tetap tunduk pada `@@unique([pekerjaanHarianId, checksumSha256])`; bukti duplikat tetap ditolak dengan pesan yang sama maknanya.
- [KEEP-9] Seluruh antarmuka berbahasa Indonesia; format tanggal dan angka tetap memakai helper yang ada (WIB/`Asia/Jakarta`), bukan format default browser.
- [KEEP-10] URL rute tidak berubah, sehingga bookmark pengguna dan navigasi langsung tetap bekerja.
- [KEEP-11] 28 spec e2e tetap menjadi kontrak perilaku: boleh berubah selector-nya, tidak boleh berkurang jumlahnya dan tidak boleh ada asersi yang dilemahkan.

## 9. Guardrails & Temuan

- [GR-1] Sentuh hanya path di tabel Area Terdampak → ditegakkan oleh review diff di PR, plus `git diff --name-only` diperiksa sebelum merge.
- [GR-2] Jangan tambah dependensi di luar daftar di CH-2 dan `@axe-core/playwright` di CH-22 → ditegakkan oleh review `package.json` + `package-lock.json` di PR.
- [GR-3] Jangan pernah commit secret; jangan menyalin nilai dari `docker-compose.yml`/`.env.example` ke kode atau ke dokumen → ditegakkan oleh review PR + pemindaian secret di CI (kalau ada) [verify: CI belum terlihat].
- [GR-4] Jangan menonaktifkan, melewati, atau menghapus tes untuk membuat build hijau; kalau spec gagal karena markup, perbaiki markup atau selector → ditegakkan oleh review PR dan pemeriksaan jumlah spec (tetap 28 atau lebih).
- [GR-5] Jangan menjalankan migrasi destruktif atau menghapus data; tidak ada migrasi baru di plan ini → ditegakkan oleh larangan `prisma migrate dev`/`db push` di PR dan review `prisma/migrations/**` (harus tidak berubah).
- [GR-6] Berhenti dengan status **blocked** kalau ada keputusan yang tidak ada di spec ini (mis. pedoman identitas visual BPS, target browser, apakah "mitra" adalah peran terpisah) → ditegakkan oleh aturan agen: jangan menebak, tulis pertanyaannya.
- [GR-7] Karena perubahan ini menyentuh UI: ikuti `design-system/*/MASTER.md` kalau ada — dan di plan ini file itu memang dibuat oleh CH-4 — serta gunakan skill `ui-ux-pro-max` dan `taste-skill` (redesign-existing-projects) → ditegakkan oleh checklist review desain per PR.
- [GR-8] Jangan mengubah skema, worker, format ekspor, atau aturan otorisasi → ditegakkan oleh review diff + `[KEEP-n]` regression test di Rencana Uji.

Temuan dari Kondisi Saat Ini yang bersinggungan dengan perubahan ini:

- [DEBT-1] Fallback hardcoded di `docker-compose.yml` (`NEXTAUTH_SECRET:-ganti-dengan-secret-acak-minimal-32-karakter`, `POSTGRES_PASSWORD:-padeknian`, `S3_KEY/S3_SECRET:-minioadmin`) → **tidak disentuh plan ini** (di luar cakupan, file di luar Area Terdampak); dibayar di plan hardening deployment terpisah sebelum go-live produksi.
- [DEBT-2] `AUTH_TRUST_HOST: "true"` bersamaan dengan `NEXTAUTH_URL` default `http://localhost:3000` → tidak disentuh; dibayar di plan hardening deployment yang sama.
- [DEBT-3] Port `15432`, `9000`, `9001` dipublikasikan ke host → tidak disentuh; dibayar di plan hardening deployment.
- [DEBT-4] `S3_PUBLIC_ENDPOINT` default `http://localhost:9000` (HTTP polos), sementara PRD §9 mewajibkan TLS 1.2+ → tidak diperbaiki di sini meskipun UI baru menampilkan pratinjau bukti; dikembalikan sebagai temuan di PR Change 3 dan dibayar sebelum rilis produksi (butuh perubahan konfigurasi server, bukan kode UI).
- [DEBT-5] Ketergantungan pada `next-auth@^5.0.0-beta.32` untuk autentikasi produksi → tidak disentuh; ditinjau di plan auth terpisah [verify: ada/tidak advisory].
- [DEBT-6] 28 spec e2e yang seluruhnya menguji lewat UI dan rentan pecah → **dibayar sekarang** lewat Change 7 (CH-23, CH-24, CH-25).
- [DEBT-7] `public/` hanya berisi 5 aset starter Next.js → **dibayar sekarang** lewat CH-9 (aset PWA) dan CH-26 (hapus starter).
- [DEBT-8] `tsconfig.tsbuildinfo` dan `test-results/.last-run.json` muncul di tree [verify] → dibayar di Fase 4 lewat CH-27 setelah status tracking dipastikan.
- [DEBT-9] `vitest` + script `"test": "vitest run"` terpasang tanpa file tes yang terlihat → **dibayar sekarang** lewat CH-28.
- [DEBT-10] Stage `tools` di `Dockerfile` dibangun di atas `builder` sehingga `npm run build` Next dijalankan penuh untuk worker `pg-boss` saja → tidak disentuh (bukan UI); dibayar di plan optimasi image terpisah.
- [DEBT-11] Script `"migrate": "prisma migrate dev"` mengundang salah pakai di server → tidak disentuh; sebaiknya diganti `migrate deploy` di plan deployment.
- [DEBT-12] Klaim `Verifikasi` append-only lewat trigger database belum terverifikasi karena `prisma/migrations/*/migration.sql` tidak disertakan → tidak diverifikasi di plan ini (butuh membaca `20261008091026_verifikasi`); karena `[KEEP-2]` mengasumsikan trigger itu ada, lakukan verifikasi cepat di Fase 1 dan laporkan hasilnya di PR Change 5.

## 10. Migrasi & Kompatibilitas

- **Migrasi database:** tidak ada. Tidak ada perubahan `prisma/schema.prisma`, tidak ada folder baru di `prisma/migrations/`, tidak ada `down.sql` yang dijalankan.
- **Data tersimpan:** tidak berubah sama sekali. Tidak ada backfill, tidak ada penulisan ulang `BuktiDukung`, `Verifikasi`, `Alokasi`, atau `RekapSKP` oleh perubahan ini.
- **Perubahan konfigurasi:** `package.json` + `package-lock.json` (dependensi UI baru, di-pin); `app/globals.css` (token); `next.config.ts` hanya kalau manifest/ikon butuh penyesuaian [verify]; file baru `public/manifest.webmanifest` dan ikon.
- **Perubahan environment:** tidak ada. Tidak ada env baru, tidak ada `.env.example` yang diubah.
- **Kompatibilitas API:** seluruh server action dan route handler di `app/api/**` mempertahankan signature, payload, dan bentuk respons. Pemanggil lama tetap bekerja.
- **Kompatibilitas URL:** semua path rute dipertahankan. Kalau ternyata ada rute yang harus dipindah, wajib menambah redirect permanen dan mencatatnya sebagai perubahan terpisah di Change 2.
- **Kompatibilitas data tersimpan:** JSON/kolom yang sudah ada dibaca dengan bentuk yang sama; tidak ada field baru, tidak ada perubahan tipe.
- **Kompatibilitas HTML/CSS:** kelas Tailwind lama diganti token baru; karena tidak ada konsumen eksternal atas markup, ini aman. Satu-satunya konsumen markup adalah 28 spec e2e, yang ditangani Change 7.

## 11. Rencana Uji

### 11.1 Baseline (dijalankan sebelum satu baris pun diubah)

1. `npm run lint`, `npm run build`, `npx playwright test` (28 spec), `npm run test` — catat hasil persisnya: nama spec yang lulus/gagal, jumlah tes vitest yang benar-benar berjalan.
2. Ukur dan catat: p95 waktu muat rute utama [verify: alat ukur belum ditentukan — sarankan Lighthouse CI atau `page.metrics()` Playwright], Lighthouse aksesibilitas awal, ukuran bundle JS klien rute utama, tambahan network transfer.
3. Ukur manual: waktu median menyelesaikan satu entri harian dan satu verifikasi, pada viewport 360 px dan 1366 px, dengan ≥5 pengguna nyata dan skenario tugas yang sama [verify: ketersediaan pengguna uji].
4. Evaluasi [KILL-1]. Kalau baseline merah ≥9 spec, plan berhenti di sini.

### 11.2 Tes baru

- **Unit (vitest):** `lib/status.test.ts` — setiap anggota `StatusVerifikasi`, `StatusAlokasi`, `StatusPekerjaan`, `StatusRekap`, `StatusPeriode`, `Prioritas` punya label Indonesia dan varian warna, dan tidak ada status yang jatuh ke fallback tanpa label (CH-5, CH-28).
- **Komponen (vitest):** render `Button`, `StatusBadge`, `DataTable` — memastikan `data-testid` ada, nama aksesibel terbentuk, dan state `disabled`/`loading` tidak bisa diklik (CH-3, CH-15).
- **E2E navigasi per peran:** untuk tiap `Role` dari `prisma/seed.ts` + `scripts/seed-demo.ts`, masuk dan pastikan menu yang dirender sesuai, dan menu peran lain tidak ada (CH-7).
- **E2E mode ringkas:** pegawai menyelesaikan entri harian dalam ≤3 langkah pada viewport 360 px, termasuk unggah satu file, dan entri muncul di antrean verifikasi Ketua Tim (CH-10, CH-12).
- **E2E verifikasi:** tiga aksi verifikasi masing-masing mengubah status, menulis riwayat, dan mengubah agregat alokasi sesuai aturan lama (CH-17, CH-18).
- **E2E tabel & filter:** filter status verifikasi dan filter periode bertahan setelah reload karena tersimpan di URL query param (CH-15).
- **E2E pratinjau bukti:** bukti gambar dan PDF tampil di panel verifikasi tanpa error (CH-18).
- **A11y (Playwright + `@axe-core/playwright`):** 5 rute utama, 0 violation serious/critical (CH-22).
- **Visual:** screenshot before/after per halaman utama untuk 4 peran, disimpan sebagai artefak PR (ditetapkan di sini karena user melewati pertanyaan kriteria sukses).

### 11.3 Tes regresi yang menjaga setiap `[KEEP-n]`

| Kontrak | Cara dibuktikan |
|---|---|
| [KEEP-1] | E2E entri: setelah submit, jumlah `menunggu` naik dan `realisasi` belum berubah; dibandingkan dengan hasil baseline |
| [KEEP-2] | E2E verifikasi + query langsung ke `Verifikasi` melalui `e2e/support/api.ts`: jumlah baris bertambah, tidak ada baris yang di-update |
| [KEEP-3] | Jalankan `npm run progres:rebuild` setelah E2E verifikasi; agregat harus sama dengan hasil sebelum rebuild |
| [KEEP-4] | E2E ambil URL bukti, pastikan host sesuai `S3_PUBLIC_ENDPOINT` dan kedaluwarsa ≤15 menit |
| [KEEP-5] | E2E negatif: akses langsung URL verifikasi sebagai `PEGAWAI` tetap ditolak, meskipun menunya disembunyikan |
| [KEEP-6] | E2E rekap: tombol Generate tetap memicu job, `StatusRekap` berjalan `QUEUED → PROSES → SELESAI`, dan versi rekap baru tidak menimpa versi lama |
| [KEEP-7] | E2E kunci periode: setelah `DIKUNCI`, aksi tulis di UI tidak tersedia dan pemanggilan langsung ke endpoint tetap ditolak |
| [KEEP-8] | E2E unggah file duplikat dan file dengan ekstensi dipalsukan; keduanya tetap ditolak server |
| [KEEP-9] | Unit test helper format tanggal/angka (WIB) + pemeriksaan tidak ada string Inggris di UI baru |
| [KEEP-10] | Daftar rute dibandingkan sebelum/sesudah; jumlah spec e2e ≥28 |
| [KEEP-11] | `npx playwright test` dijalankan di setiap akhir fase; jumlah spec tidak boleh turun |

## 12. Rollback

- **Persiapan:** sebelum mulai, buat tag git `pre-ui-redesign` pada commit terakhir yang 28 spec-nya hijau, dan catat hasil baseline di deskripsi PR.
- **Rollback kode:** karena tidak ada migrasi database dan tidak ada perubahan data, rollback cukup `git revert` per fase (satu PR per fase) atau checkout ke `pre-ui-redesign`. Urutan aman: Fase 4 → 3 → 2 → 1.
- **Rollback dependensi:** hapus dependensi yang ditambahkan CH-2 dan CH-22 dari `package.json`, jalankan instalasi ulang, dan pastikan `package-lock.json` kembali ke keadaan semula. Tidak ada dependensi baru yang menulis data atau mengubah state runtime.
- **Rollback aset & konfigurasi:** `public/manifest.webmanifest` dan ikon cukup dihapus; `app/layout.tsx` kembali ke versi tag. Referensi manifest yang tertinggal hanya menghasilkan 404 yang tidak berdampak fungsional.
- **Rollback data:** **tidak diperlukan.** Tidak ada skema, status, atau isi tabel yang diubah plan ini. Kalau ternyata ada data E2E yang kotor, `e2e/global-setup.ts` sudah melakukan reset DB E2E — jalankan ulang, bukan restore dari backup.
- **Rollback sebagian (paling mungkin dipakai):** kalau hanya Fase 2 yang bermasalah, revert Change 3/4/5/7 dan pertahankan Change 1/2 (fondasi + shell) karena keduanya tidak mengubah perilaku.
- **Setelah rollback:** jalankan kembali 28 spec e2e dan `npm run build`; keduanya harus hijau sebelum pekerjaan dilanjutkan.

## 13. Rencana Rilis

### Fase 1: Fondasi dan shell

**Lingkup:** baseline tes & pengukuran (11.1), Change 1 (token + komponen primitif + `design-system/MASTER.md`), Change 2 (app shell, navigasi per peran, PWA). Belum ada perubahan tata letak mendalam pada halaman fitur.

- [EC-1.1] Hasil baseline terdokumentasi di deskripsi PR: 28 spec (jumlah lulus/gagal + nama yang gagal), hasil vitest, p95 muat, skor aksesibilitas awal, ukuran bundle.
- [EC-1.2] [KILL-1] dievaluasi dan tidak terpicu, atau plan dihentikan dengan catatan.
- [EC-1.3] `npm run lint` dan `npm run build` hijau.
- [EC-1.4] Shell benar pada 360/768/1024/1440 px; tidak ada scroll horizontal dan tidak ada kontrol <44×44 px pada 360 px.
- [EC-1.5] Navigasi benar untuk keempat `Role` menggunakan akun dari `prisma/seed.ts` dan `scripts/seed-demo.ts`; menu peran lain tidak dirender.
- [EC-1.6] [KEEP-5] diverifikasi manual: menyembunyikan menu tidak mencabut otorisasi — akses URL langsung sebagai peran tanpa hak tetap ditolak.
- [EC-1.7] [KILL-2] dicek: tambahan bundle rute utama ≤150 KB gzip dan p95 muat ≤2,0 detik.
- [EC-1.8] Manifest PWA valid dan ikon tampil saat dipasang [verify: butuh perangkat uji].

### Fase 2: Permukaan per peran

**Lingkup:** Change 7 lebih dulu (konvensi testid + penyelarasan selector 28 spec), lalu Change 3 (mode ringkas pegawai/mitra), Change 4 (dashboard & tabel), Change 5 (verifikasi).

- [EC-2.1] Seluruh 28 spec e2e hijau; jumlah spec tidak berkurang (≥28).
- [EC-2.2] [KEEP-1] terbukti: entri harian selesai ≤3 langkah pada 360 px, dan efek datanya identik dengan hasil baseline.
- [EC-2.3] [KEEP-2] dan [KEEP-3] terbukti lewat E2E verifikasi + `npm run progres:rebuild`.
- [EC-2.4] [KEEP-6] dan [KEEP-7] terbukti lewat E2E rekap dan kunci periode.
- [EC-2.5] [KEEP-8] terbukti: file duplikat dan file palsu tetap ditolak server.
- [EC-2.6] KPI + antrean menunggu verifikasi terlihat tanpa scroll pada 1366×768 untuk `KETUA_TIM` dan `PIMPINAN`.
- [EC-2.7] Filter tabel bertahan setelah reload (tersimpan di URL query param).
- [EC-2.8] [KILL-3] dicek: tidak ada spec merah tersisa akibat markup, atau Fase 2 di-rollback.

### Fase 3: Aksesibilitas, responsif, performa

**Lingkup:** Change 6 (kontras, keyboard, 360 px, zoom 200%, spec axe) dan pengukuran dampak usability.

- [EC-3.1] Lighthouse aksesibilitas ≥95 pada 5 rute utama.
- [EC-3.2] Spec `@axe-core/playwright` lolos dengan 0 violation serious/critical pada 5 rute utama.
- [EC-3.3] Seluruh pasangan warna token memenuhi WCAG 2.1 AA; hasil pemeriksaan kontras dicatat di PR.
- [EC-3.4] [DEBT-12] hasil verifikasi trigger append-only `Verifikasi` dilaporkan; kalau trigger tidak ada, hentikan Change 5 dan angkat sebagai temuan blocking.
- [EC-3.5] p95 muat ≤2,0 detik pada rute utama (PRD §9) [verify: lingkungan ukur].
- [EC-3.6] [KILL-4] dicek: waktu median entri harian turun ≥25% dibanding baseline; kalau tidak, Fase 4 dipotong dan Change 4/5 di-rescope.
- [EC-3.7] 28 spec e2e + seluruh spec baru tetap hijau.

### Fase 4: Cleanup dan unit test

**Lingkup:** Change 8 (hapus aset starter, bersihkan artefak ter-track, unit test pertama) dan penutupan plan.

- [EC-4.1] `npm run test` menjalankan minimal 5 tes unit dan semuanya hijau (bukan nol tes).
- [EC-4.2] `public/` tidak lagi berisi aset starter Next.js; tidak ada referensi yang rusak.
- [EC-4.3] `tsconfig.tsbuildinfo` dan `test-results/.last-run.json` tidak lagi ter-track, atau dicatat sebagai [DEBT-8] kalau terbukti memang tidak ter-track.
- [EC-4.4] Seluruh 28 spec e2e + spec baru hijau, dan hasilnya terlampir di PR terakhir.
- [EC-4.5] Seluruh `[DEBT-n]` yang belum dibayar tercatat dengan pemilik dan plan lanjutannya, tanpa ada yang hilang.

## 14. Risiko & Pertanyaan Terbuka

### Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Markup baru memecahkan banyak spec e2e sekaligus (28 spec semuanya menguji lewat UI) | Rilis tertahan, kredibilitas tes turun | Change 7 dikerjakan lebih dulu di Fase 2 (konvensi testid + `getByRole`); jalankan e2e di setiap akhir fase; jangan melemahkan asersi ([GR-4]) |
| Library komponen pihak ketiga belum pernah diuji bersama Tailwind 4.3.3 dan Next 15.5.27 | Rework besar di tengah Fase 2 | Spike 0,5 hari di Fase 1 sebelum CH-3 dimulai; batasi daftar dependensi di CH-2; [KILL-2] sebagai pintu keluar |
| Tambahan bundle/performa menembus p95 ≤2,0 detik (PRD §9) | Melanggar kontrak usability | Anggaran bundle ≤150 KB gzip; ukur di EC-1.7 dan EC-3.5; kalau gagal, buang library dan pakai primitif Tailwind tangan |
| Navigasi role-aware disalahpahami sebagai kontrol keamanan | Celah otorisasi baru | [KEEP-5] + [GR-8]: UI hanya kosmetik, otorisasi tetap di `middleware.ts`/`auth.config.ts`; E2E negatif di EC-1.6 |
| Redesign mengubah perilaku entri/verifikasi tanpa disadari | Data capaian & audit trail rusak | [KEEP-1]/[KEEP-2]/[KEEP-3] dijadikan tes regresi eksplisit; tidak ada aksi massal verifikasi (CH-17); tidak ada perubahan `recalculateProgresAlokasi` |
| Pegawai/mitra terbiasa alur lama dan kehilangan orientasi | Adopsi turun, entri harian menumpuk | Desktop/mobile layout baru tapi label dan urutan langkah di jalur kritis dipertahankan; perubahan pada jalur kritis dijaga seminimal mungkin |
| Palet warna BPS bertabrakan dengan syarat kontras AA | Harus mengulang Fase 3 | Tetapkan token di Fase 1 dan uji kontras saat itu juga (CH-1, CH-20), bukan di akhir |
| Klaim trigger append-only `Verifikasi` ternyata tidak ada di migrasi | Panel verifikasi baru dibangun di atas asumsi yang salah | [DEBT-12]: verifikasi cepat di Fase 1, laporkan di EC-3.4 |

### Pertanyaan terbuka

1. Apakah ada **pedoman identitas visual resmi BPS** (logo, palet korporat, tipografi, aturan penggunaan lambang) yang wajib dipakai? Tanpa ini, CH-1 memakai palet netral dan harus diganti [verify].
2. Jawaban klarifikasi menyebut "pegawai **atau mitra**". Skema hanya punya empat `Role` dan tidak ada `MITRA`. Apakah mitra adalah `PEGAWAI` dengan penugasan terbatas, atau memang perlu peran/tipe akun baru? Kalau perlu peran baru, itu perubahan skema dan **di luar cakupan plan ini**.
3. Berapa **jumlah pengguna aktif per peran** dan berapa **rate biaya internal** (Rp/person-day, Rp/jam)? Keduanya dipakai untuk ROI di §4 dan sekarang `[verify]`.
4. **Target browser** apa yang harus didukung (versi Chrome/Edge/Safari, apakah masih ada perangkat Android lama)? Ini menentukan batas CSS modern yang boleh dipakai.
5. Apakah **PWA installable** harus selesai di plan ini, atau cukup responsive web? CH-9 mengasumsikan installable sesuai PRD §9, tapi bisa diturunkan ke Fase 4 kalau bukan prioritas.
6. Apakah **dark mode** dibutuhkan? Saat ini di luar cakupan; token disiapkan agar murah ditambahkan nanti.
7. Apakah boleh menambah dependensi pihak ketiga (Radix, `lucide-react`, `@axe-core/playwright`) menurut kebijakan pengadaan/keamanan internal? Secara teknis user sudah bilang boleh, tapi perlu konfirmasi administrasi [verify].
8. Bagaimana **akses ke lingkungan mirip produksi** untuk mengukur p95 dan Lighthouse? Semua target performa di §3 bergantung pada jawaban ini [verify].
9. Apakah `plankit/TASKS.md` masih punya task terbuka? Isinya tidak disertakan, jadi tidak bisa dipastikan tidak ada tumpang tindih dengan plan ini [verify].
