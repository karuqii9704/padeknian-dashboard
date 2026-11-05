import { redirect } from "next/navigation";
import { HttpError, requireRole } from "@/lib/rbac";
import { rekapSaya } from "@/lib/rekap-saya";
import { IkonUnduh } from "../../ui/icons";
import { EmptyState, Halaman, PageHeader } from "../../ui/primitives";
import { ProgressBar } from "../alokasi/progress-bar";

export const dynamic = "force-dynamic";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const angka = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
const tanggalWaktu = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

function Angka({ label, nilai, ket }: { label: string; nilai: string; ket?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2.5">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{nilai}</p>
      {ket && <p className="text-xs text-ink-muted">{ket}</p>}
    </div>
  );
}

/** Rekap SKP bulanan milik sendiri (Pegawai & Ketua Tim): ringkasan capaian dan unduhan PDF. */
export default async function RekapSayaPage() {
  let user;
  try {
    user = await requireRole("PEGAWAI", "KETUA_TIM");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    return (
      <Halaman lebar="max-w-xl">
        <PageHeader judul="Akses ditolak" keterangan="Halaman ini untuk Pegawai dan Ketua Tim." />
      </Halaman>
    );
  }
  const daftar = await rekapSaya(user.id);

  return (
    <Halaman lebar="max-w-4xl">
      <PageHeader
        eyebrow="Laporan"
        judul="Rekap Saya"
        keterangan="Rekap SKP bulanan Anda sebagai bahan penyusunan capaian kinerja. Capaian hanya menghitung catatan yang sudah disetujui ketua tim."
      />

      {daftar.length === 0 && (
        <EmptyState
          judul="Belum ada rekap untuk Anda."
          keterangan="Rekap dibuat oleh Admin atau Pimpinan, biasanya di akhir bulan. Setelah dibuat, rekap Anda muncul di sini."
        />
      )}

      {daftar.map((r) => {
        const s = r.ringkasan;
        return (
          <section key={r.id} data-rekap={r.id} aria-label={`Rekap ${BULAN[r.periode.bulan - 1]} ${r.periode.tahun}`} className="panel space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  {BULAN[r.periode.bulan - 1]} {r.periode.tahun}
                  {r.isFinal ? (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 ring-1 ring-green-200 dark:bg-[#04140a] dark:text-green-200 dark:ring-green-900">Final</span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200 dark:bg-[#1a1200] dark:text-amber-200 dark:ring-amber-900">
                      Sementara · versi {r.versi}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-ink-muted">
                  {r.selesaiPada ? `Dibuat ${tanggalWaktu(r.selesaiPada)}` : ""}
                  {!r.isFinal && " · angka dapat berubah sampai periode dikunci"}
                </p>
              </div>
              {r.adaPdf && (
                <a href={`/api/rekap/${r.id}/download?format=pdf`} className="btn btn-primary">
                  <IkonUnduh className="h-4 w-4" /> Unduh PDF
                </a>
              )}
            </div>

            {s ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Angka
                    label="Hari kerja terisi"
                    nilai={`${s.hariKerja.terisi}/${s.hariKerja.periode}`}
                    ket={s.hariKerja.persenTerisi === null ? undefined : `${angka(s.hariKerja.persenTerisi)}%`}
                  />
                  <Angka label="Catatan disetujui" nilai={`${s.entri.disetujui}/${s.entri.total}`} ket={s.entri.menunggu ? `${s.entri.menunggu} menunggu` : undefined} />
                  <Angka label="Perlu revisi/ditolak" nilai={String(s.entri.mintaRevisi + s.entri.ditolak)} />
                  <Angka label="Bukti dukung" nilai={String(s.jumlahBukti)} ket="berkas" />
                </div>

                {s.alokasi.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Capaian per alokasi</h3>
                    <ul className="space-y-3">
                      {s.alokasi.map((a, i) => (
                        <li key={i}>
                          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                            <span className="min-w-0 break-words">{a.judul}</span>
                            <span className="tabular-nums text-ink-soft">
                              {angka(a.realisasi)} / {angka(a.target)} {a.satuan}
                              {a.menunggu > 0 && <span className="text-xs text-amber-700 dark:text-amber-300"> (+{angka(a.menunggu)} menunggu)</span>}
                            </span>
                          </div>
                          <ProgressBar persen={a.persen ?? 0} label={`Capaian ${a.judul}`} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.jumlahTugasTambahan > 0 && (
                  <p className="text-xs text-ink-muted">Ditambah {s.jumlahTugasTambahan} tugas tambahan (rinciannya ada di PDF).</p>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-muted">Ringkasan tidak tersedia untuk versi rekap ini; unduh PDF untuk melihat rinciannya.</p>
            )}
          </section>
        );
      })}
    </Halaman>
  );
}
