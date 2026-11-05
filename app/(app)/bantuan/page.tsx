import { redirect } from "next/navigation";
import Link from "next/link";
import { MAKS_FILE_PER_ENTRI } from "@/lib/bukti-batas";
import { BATAS_BACKFILL_HARI } from "@/lib/validasi-entri";
import { HttpError, requireSession } from "@/lib/rbac";
import { Halaman, PageHeader } from "../../ui/primitives";

export const dynamic = "force-dynamic";

type Bagian = { judul: string; tautan?: { href: string; label: string }; langkah: React.ReactNode[] };
type Panduan = { peran: string; label: string; ringkas: string; bagian: Bagian[] };

const PEGAWAI: Bagian[] = [
  {
    judul: "Mencatat pekerjaan harian",
    tautan: { href: "/hari-ini", label: "Buka Hari Ini" },
    langkah: [
      <>Buka <b>Hari Ini</b> lalu tekan <b>Catat pekerjaan</b>.</>,
      <>Pilih alokasi dari ketua tim, atau <b>Tugas tambahan</b> bila pekerjaan di luar alokasi (isi judul dan satuannya).</>,
      <>Tanggal: hari ini, atau catatan susulan paling lambat {BATAS_BACKFILL_HARI} hari ke belakang. Hanya hari kerja pada periode aktif.</>,
      <>Isi deskripsi capaian, volume, dan status (belum mulai/proses/selesai). Kendala boleh dikosongkan.</>,
      <>Lampirkan bukti dukung: JPG, PNG, PDF, DOCX, atau XLSX, maksimal 10 MB per berkas dan {MAKS_FILE_PER_ENTRI} berkas per catatan. Foto dari kamera dikecilkan otomatis.</>,
    ],
  },
  {
    judul: "Memperbaiki catatan yang diminta revisi",
    tautan: { href: "/revisi", label: "Buka Revisi" },
    langkah: [
      <>Catatan yang diminta revisi atau ditolak muncul di <b>Revisi</b> (angka merah di menu) bersama catatan dari ketua tim.</>,
      <>Ubah isi atau ganti bukti sesuai catatan. Setelah disimpan, catatan otomatis kembali <b>menunggu verifikasi</b>.</>,
      <>Catatan yang sudah disetujui, atau periode yang sudah dikunci, tidak dapat diubah.</>,
    ],
  },
  {
    judul: "Melihat target dan progres",
    tautan: { href: "/alokasi", label: "Buka Alokasi" },
    langkah: [
      <><b>Alokasi</b> berisi target pekerjaan dari ketua tim. Progres hanya menghitung volume yang sudah <b>disetujui</b>; yang masih menunggu ditampilkan terpisah.</>,
      <><b>Kalender</b> menunjukkan hari yang sudah dan belum terisi.</>,
    ],
  },
  {
    judul: "Melaporkan event",
    tautan: { href: "/event", label: "Buka Event" },
    langkah: [
      <>Laporkan rapat, pelatihan, atau survei lapangan di <b>Event</b>, dengan hingga 10 lampiran dokumentasi.</>,
      <>Event dibaca ketua tim, tetapi <b>tidak diverifikasi dan tidak masuk rekap SKP</b>.</>,
    ],
  },
  {
    judul: "Tim dan rekap saya",
    tautan: { href: "/rekap-saya", label: "Buka Rekap Saya" },
    langkah: [
      <><b>Tim Saya</b> menampilkan tim Anda per periode; ketua tim ditandai label kuning.</>,
      <><b>Rekap Saya</b> berisi ringkasan capaian bulanan dan PDF rekap SKP Anda. Label <b>Sementara</b> berarti angka masih bisa berubah sampai periode dikunci.</>,
      <>Setiap hari kerja pukul 08.00 WIB, Anda mendapat pengingat bila belum mencatat pekerjaan pada hari kerja sebelumnya. Ketuk pengingat untuk langsung mencatat tanggal tersebut.</>,
    ],
  },
];

const PANDUAN: Panduan[] = [
  { peran: "PEGAWAI", label: "Pegawai", ringkas: "Mencatat pekerjaan harian, memperbaiki revisi, dan melihat rekap sendiri.", bagian: PEGAWAI },
  {
    peran: "KETUA_TIM",
    label: "Ketua Tim",
    ringkas: "Semua yang dilakukan pegawai, ditambah mengalokasikan pekerjaan, mengatur anggota, dan memverifikasi.",
    bagian: [
      {
        judul: "Memverifikasi catatan anggota",
        tautan: { href: "/verifikasi", label: "Buka Verifikasi" },
        langkah: [
          <><b>Verifikasi</b> berisi catatan anggota yang menunggu, yang paling lama di atas. Angka kuning di menu adalah jumlah antrean.</>,
          <>Pilih <b>Setujui</b>, <b>Minta revisi</b>, atau <b>Tolak</b>. Minta revisi dan tolak wajib disertai catatan (minimal 10 karakter) agar anggota tahu yang harus diperbaiki.</>,
          <>Centang beberapa catatan lalu <b>Setujui terpilih</b> untuk persetujuan sekaligus. Catatan Anda sendiri tidak dapat Anda verifikasi.</>,
          <>Usahakan antrean tidak lebih dari 3 hari; Dashboard menampilkan kecepatan verifikasi tim Anda.</>,
        ],
      },
      {
        judul: "Mengalokasikan pekerjaan",
        tautan: { href: "/alokasi", label: "Buka Alokasi" },
        langkah: [
          <>Buat alokasi berisi judul, deskripsi, rentang tanggal, target volume, satuan, prioritas, dan penerima (target bisa berbeda per orang).</>,
          <>Gunakan <b>Salin</b> untuk menyalin alokasi periode sebelumnya sebagai draf.</>,
          <>Alokasi yang sudah berisi catatan tidak bisa dihapus; <b>batalkan</b> dengan alasan.</>,
        ],
      },
      {
        judul: "Mengatur anggota tim",
        tautan: { href: "/tim-saya", label: "Buka Tim Saya" },
        langkah: [
          <>Di <b>Tim Saya</b>, pilih periode lalu tambah atau keluarkan anggota tim yang Anda pimpin. Keanggotaan berlaku per periode.</>,
          <>Anggota menentukan catatan siapa yang Anda verifikasi dan pantau. Catatan lama tetap tersimpan bila anggota dikeluarkan.</>,
        ],
      },
      {
        judul: "Memantau tim",
        tautan: { href: "/dashboard", label: "Buka Dashboard" },
        langkah: [
          <><b>Dashboard</b>: kartu ringkasan, pemantauan harian (pilih metrik, tampilan batang atau garis), kecepatan verifikasi, peta kepatuhan, dan profil per anggota.</>,
          <><b>Rekap</b>: unduh PDF rekap anggota tim Anda.</>,
        ],
      },
      ...PEGAWAI,
    ],
  },
  {
    peran: "PIMPINAN",
    label: "Pimpinan",
    ringkas: "Memantau seluruh tim, menyusun rekap bulanan, dan menutup periode.",
    bagian: [
      {
        judul: "Memantau kinerja",
        tautan: { href: "/dashboard", label: "Buka Dashboard" },
        langkah: [
          <>Saring Dashboard menurut periode, tim, atau pegawai. Klik nama pegawai untuk rincian catatan beserta buktinya, atau buka profilnya.</>,
          <>Panel <b>Kecepatan verifikasi</b> menunjukkan tim yang antreannya menumpuk; angka merah berarti ada catatan menunggu lebih dari 3 hari.</>,
          <><b>Ekspor XLSX</b> menyimpan tabel sesuai saringan saat ini.</>,
        ],
      },
      {
        judul: "Rekap bulanan dan penutupan periode",
        tautan: { href: "/rekap", label: "Buka Rekap" },
        langkah: [
          <>Di <b>Rekap</b>, tekan <b>Generate rekap</b>. Rekap dibuat di latar belakang; halaman memperbarui statusnya sendiri.</>,
          <>Unduh XLSX (semua pegawai), PDF per pegawai, atau <b>ZIP bukti</b> per pegawai. Generate ulang membuat versi baru tanpa menghapus versi lama.</>,
          <><b>Kunci periode</b> menjadikan seluruh data periode hanya-baca dan membuat rekap final. <b>Penguncian permanen</b>; pastikan verifikasi sudah selesai.</>,
        ],
      },
    ],
  },
  {
    peran: "ADMIN",
    label: "Admin",
    ringkas: "Mengelola akun, tim, periode, dan data induk; memantau keamanan.",
    bagian: [
      {
        judul: "Akun pengguna",
        tautan: { href: "/admin/pengguna", label: "Buka Pengguna" },
        langkah: [
          <>Tambah akun (NIP, nama, peran). Sampaikan password sementara lewat jalur aman; pengguna wajib menggantinya saat login pertama.</>,
          <><b>Reset password</b> membuat password sementara baru dan mengeluarkan semua sesi pengguna itu.</>,
          <>Nonaktifkan akun yang tidak dipakai; riwayat pekerjaannya tetap tersimpan.</>,
          <>Tab <b>Perlu diingatkan</b> menampilkan pegawai yang paling jarang mengisi; tombol <b>Kirim pengingat sekarang</b> mengirim pengingat di luar jadwal 08.00.</>,
        ],
      },
      {
        judul: "Tim, periode, dan kegiatan",
        tautan: { href: "/admin/periode", label: "Buka Periode" },
        langkah: [
          <><b>Tim</b>: buat tim per tahun, tetapkan ketua, dan atur anggota per periode.</>,
          <><b>Periode</b>: buat dan aktifkan periode bulanan; kelola <b>hari libur</b> agar pengingat dan persentase kepatuhan tepat.</>,
          <><b>Kegiatan</b>: master kegiatan yang dapat dipilih saat membuat alokasi.</>,
        ],
      },
      {
        judul: "Pemantauan dan keamanan",
        tautan: { href: "/admin/audit-log", label: "Buka Audit Log" },
        langkah: [
          <><b>Audit Log</b> mencatat login (termasuk yang gagal), perubahan akun dan peran, reset password, verifikasi, alokasi, penguncian, dan unduhan arsip.</>,
          <>Login dikunci 15 menit setelah 5 kali salah dari perangkat/jaringan yang sama; reset password juga membuka kunci itu.</>,
          <>Lihat juga Dashboard dan Rekap (sama seperti Pimpinan), serta pemakaian penyimpanan bukti di halaman Periode.</>,
        ],
      },
    ],
  },
];

const UMUM: Bagian[] = [
  {
    judul: "Akun dan keamanan",
    langkah: [
      <>Login dengan NIP atau email. Sesi berakhir setelah 8 jam, atau 60 menit tanpa aktivitas.</>,
      <>Ganti password lewat menu profil (kanan atas). Setelah diganti, sesi di perangkat lain otomatis keluar.</>,
      <>Lupa password: minta Admin melakukan reset.</>,
    ],
  },
  {
    judul: "Memasang aplikasi di HP",
    langkah: [
      <>Android (Chrome): buka aplikasi, menu ⋮, lalu <b>Tambahkan ke layar utama</b> atau <b>Instal aplikasi</b>.</>,
      <>iPhone (Safari): tombol <b>Bagikan</b>, lalu <b>Tambah ke Layar Utama</b>.</>,
      <>Tanpa sinyal, aplikasi menampilkan halaman offline. Data tidak disimpan di HP, jadi catat saat sinyal kembali (susulan maksimal {BATAS_BACKFILL_HARI} hari).</>,
    ],
  },
];

function KartuBagian({ b }: { b: Bagian }) {
  return (
    <section className="panel space-y-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{b.judul}</h3>
        {b.tautan && (
          <Link href={b.tautan.href} className="text-sm font-medium text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-600 dark:text-brand-300">
            {b.tautan.label}
          </Link>
        )}
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-ink-soft">
        {b.langkah.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
    </section>
  );
}

/** Panduan pemakaian per peran; peran pengguna yang login ditampilkan pertama dan terbuka. */
export default async function BantuanPage() {
  let user;
  try {
    user = await requireSession();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    redirect("/ganti-password");
  }
  const milik = PANDUAN.find((p) => p.peran === user.role)!;
  const lain = PANDUAN.filter((p) => p.peran !== user.role);

  return (
    <Halaman lebar="max-w-3xl">
      <PageHeader eyebrow="Bantuan" judul="Panduan pemakaian" keterangan={<>Panduan untuk peran Anda: <b>{milik.label}</b>. {milik.ringkas}</>} />

      <div className="space-y-3" data-panduan={milik.peran}>
        {milik.bagian.map((b) => (
          <KartuBagian key={b.judul} b={b} />
        ))}
      </div>

      <h2 className="pt-2 text-[15px] font-semibold">Umum</h2>
      <div className="space-y-3">
        {UMUM.map((b) => (
          <KartuBagian key={b.judul} b={b} />
        ))}
      </div>

      <h2 className="pt-2 text-[15px] font-semibold">Panduan peran lain</h2>
      <p className="text-sm text-ink-muted">Berguna untuk sosialisasi atau saat membantu rekan.</p>
      <div className="space-y-2">
        {lain.map((p) => (
          <details key={p.peran} className="panel group p-4">
            <summary className="cursor-pointer list-none font-medium">
              <span className="mr-2 inline-block transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
              {p.label}
              <span className="block pl-5 text-sm font-normal text-ink-muted">{p.ringkas}</span>
            </summary>
            <div className="mt-3 space-y-3">
              {p.bagian
                .filter((b) => p.peran !== "KETUA_TIM" || !PEGAWAI.includes(b))
                .map((b) => (
                  <KartuBagian key={b.judul} b={b} />
                ))}
            </div>
          </details>
        ))}
      </div>
    </Halaman>
  );
}
