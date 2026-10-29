import Link from "next/link";
import { redirect } from "next/navigation";
import { angkaRingkas } from "@/lib/alokasi-format";
import { ringkasanBeranda } from "@/lib/beranda";
import { labelTanggal, tanggalSingkat } from "@/lib/tanggal-id";
import { HttpError, requireRole } from "@/lib/rbac";
import { ProgressBar } from "../alokasi/progress-bar";
import { StatusBadge } from "../status-badge";
import { IkonEvent, IkonHariIni, IkonKalender, IkonRevisi, IkonVerifikasi } from "../../ui/icons";
import { Alert, EmptyState, Halaman, PageHeader } from "../../ui/primitives";

export const dynamic = "force-dynamic";

type Ikon = (p: { className?: string }) => React.ReactElement;

function KartuAksi({ href, ikon: Ikon, judul, keterangan }: { href: string; ikon: Ikon; judul: string; keterangan: string }) {
  return (
    <Link
      href={href}
      className="panel flex min-h-28 min-w-0 flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5"
    >
      <span aria-hidden className="flex size-10 items-center justify-center rounded-xl bg-background text-brand-600 ring-1 ring-border">
        <Ikon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium leading-snug">{judul}</span>
        <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{keterangan}</span>
      </span>
    </Link>
  );
}

function Angka({ href, nilai, label, sorot }: { href: string; nilai: number; label: string; sorot?: boolean }) {
  return (
    <Link href={href} className="panel flex min-w-0 flex-col gap-1 p-4 transition hover:shadow-md">
      <span className={`text-2xl font-medium tabular-nums ${sorot && nilai > 0 ? "text-red-700" : ""}`}>{nilai}</span>
      <span className="text-xs text-ink-muted">{label}</span>
    </Link>
  );
}

export default async function BerandaPage() {
  let user;
  try {
    user = await requireRole("PEGAWAI", "KETUA_TIM");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    return (
      <Halaman lebar="max-w-xl">
        <PageHeader judul="Akses ditolak" keterangan="Halaman ini untuk pegawai dan ketua tim." />
      </Halaman>
    );
  }
  const d = await ringkasanBeranda(user);
  const sudah = d.jumlahEntriHariIni > 0;

  return (
    <Halaman lebar="max-w-4xl" className="space-y-6">
      <PageHeader eyebrow={labelTanggal(d.hariIni)} judul={d.salam} keterangan="Apa yang ingin Anda lakukan hari ini?" />

      {!d.adaPeriode ? (
        <Alert nada="peringatan">Belum ada periode aktif, jadi pekerjaan belum bisa dicatat. Hubungi admin.</Alert>
      ) : !d.hariKerja ? (
        <Alert nada="info">
          {d.keterangan}. Anda tetap dapat mencatat untuk hari kerja sebelumnya (maksimal 3 hari kalender ke belakang).
        </Alert>
      ) : sudah ? (
        <Alert nada="sukses">Sudah ada {d.jumlahEntriHariIni} catatan pekerjaan hari ini.</Alert>
      ) : (
        <Alert nada="peringatan">Belum ada catatan pekerjaan hari ini.</Alert>
      )}

      <section aria-labelledby="h-aksi">
        <h2 id="h-aksi" className="mb-2.5 text-[15px] font-semibold">Aksi cepat</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KartuAksi href={d.bisaCatat ? "/hari-ini?catat=1" : "/hari-ini"} ikon={IkonHariIni} judul="Catat pekerjaan hari ini" keterangan="Laporan harian dan bukti dukung" />
          <KartuAksi href="/event?baru=1" ikon={IkonEvent} judul="Lapor event" keterangan="Rapat, pelatihan, survei lapangan" />
          <KartuAksi href="/revisi" ikon={IkonRevisi} judul="Lihat revisi" keterangan="Catatan yang perlu diperbaiki" />
          <KartuAksi href="/kalender" ikon={IkonKalender} judul="Kalender" keterangan="Riwayat pengisian per bulan" />
          {d.menunggu !== null && <KartuAksi href="/verifikasi" ikon={IkonVerifikasi} judul="Verifikasi" keterangan="Periksa catatan anggota tim" />}
        </div>
      </section>

      <section aria-labelledby="h-ringkasan">
        <h2 id="h-ringkasan" className="mb-2.5 text-[15px] font-semibold">Ringkasan</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Angka href="/hari-ini" nilai={d.jumlahEntriHariIni} label="Catatan hari ini" />
          <Angka href="/revisi" nilai={d.revisi} label="Perlu revisi" sorot />
          {d.menunggu !== null && <Angka href="/verifikasi" nilai={d.menunggu} label="Menunggu verifikasi" />}
          <Angka href="/alokasi" nilai={d.jumlahAlokasi} label="Alokasi berjalan" />
        </div>
      </section>

      {d.alokasiTeratas.length > 0 && (
        <section aria-labelledby="h-alokasi">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h2 id="h-alokasi" className="text-[15px] font-semibold">Progres alokasi</h2>
            <Link href="/alokasi" className="text-xs text-ink-muted underline-offset-4 hover:underline">
              Lihat semua ({d.jumlahAlokasi})
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3">
            {d.alokasiTeratas.map((a) => (
              <li key={a.penugasanId} className="panel flex min-w-0 flex-col p-4">
                <h3 className="truncate font-medium leading-snug">{a.judul}</h3>
                <p className="mt-0.5 text-xs text-ink-muted">sampai {tanggalSingkat(a.tanggalSelesai)}</p>
                <p className="mb-1.5 mt-auto pt-3 text-xs text-ink-soft">
                  {angkaRingkas(String(a.realisasi))} / {angkaRingkas(String(a.target))} {a.satuan}
                </p>
                <ProgressBar persen={a.persen} label={`Progres ${a.judul}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-aktivitas">
        <h2 id="h-aktivitas" className="mb-2.5 text-[15px] font-semibold">Aktivitas terbaru</h2>
        {d.aktivitas.length === 0 ? (
          <div className="panel">
            <EmptyState kecil judul="Belum ada aktivitas." keterangan="Catatan pekerjaan dan event Anda akan muncul di sini." />
          </div>
        ) : (
          <ul className="panel divide-y divide-line overflow-hidden">
            {d.aktivitas.map((a) => (
              <li key={`${a.tipe}-${a.id}`}>
                <Link href={a.href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-background/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.judul}</span>
                    <span className="block text-xs text-ink-muted">{labelTanggal(a.tanggal)}</span>
                  </span>
                  {a.tipe === "event" ? <span className="chip shrink-0">Event</span> : a.status ? <StatusBadge status={a.status} /> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Halaman>
  );
}
