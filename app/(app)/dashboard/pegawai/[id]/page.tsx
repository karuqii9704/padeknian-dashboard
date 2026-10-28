import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { angkaRingkas } from "@/lib/alokasi-format";
import { SEL } from "@/lib/dashboard-analitik";
import { db } from "@/lib/db";
import { profilPegawai } from "@/lib/profil-pegawai";
import { HttpError, requireRole } from "@/lib/rbac";
import { uuidSchema } from "@/lib/schemas";
import { labelTanggal } from "@/lib/tanggal-id";
import { ProgressBar } from "../../../alokasi/progress-bar";
import { DaftarBukti } from "../../../bukti/daftar-bukti";
import { IndikatorBukti } from "../../../bukti/indikator-bukti";
import { StatusBadge } from "../../../status-badge";
import { IkonKiri } from "../../../../ui/icons";
import { inisial } from "../../../../ui/inisial";
import { EmptyState, Halaman, PageHeader } from "../../../../ui/primitives";
import { PilihPeriode } from "./pilih-periode";

export const dynamic = "force-dynamic";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BULAN3 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const PRIORITAS: Record<string, string> = { RENDAH: "Rendah", SEDANG: "Sedang", TINGGI: "Tinggi" };
const SEL_CLS: Record<number, string> = { [SEL.KOSONG]: "bg-gray-100 text-ink-muted", [SEL.DISETUJUI]: "bg-brand-500 text-white", [SEL.MENUNGGU]: "bg-gold-400 text-brand-950", [SEL.REVISI]: "bg-red-500 text-white" };
const SEL_LABEL: Record<number, string> = { [SEL.KOSONG]: "belum ada catatan", [SEL.DISETUJUI]: "disetujui", [SEL.MENUNGGU]: "menunggu verifikasi", [SEL.REVISI]: "perlu revisi" };
const desimal = (n: number | null) => (n === null ? "–" : `${String(n).replace(".", ",")}%`);

function Statistik({ label, nilai, ket }: { label: string; nilai: string; ket?: string }) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-brand-900">{nilai}</dd>
      {ket && <dd className="text-xs text-ink-muted">{ket}</dd>}
    </div>
  );
}

export default async function ProfilPegawaiPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periodeId?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  let me;
  try {
    me = await requireRole("KETUA_TIM", "PIMPINAN");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    return (
      <Halaman lebar="max-w-xl">
        <PageHeader judul="Akses ditolak" keterangan="Profil pegawai untuk Ketua Tim dan Pimpinan." />
      </Halaman>
    );
  }
  if (!uuidSchema.safeParse(id).success) notFound();
  const periodeId = uuidSchema.safeParse(sp.periodeId).success ? sp.periodeId : undefined;

  let p;
  try {
    p = await profilPegawai(me, id, periodeId);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) {
      return (
        <Halaman>
          <Link href="/dashboard" className="btn btn-ghost -ml-3"><IkonKiri className="h-4 w-4" /> Dashboard</Link>
          <EmptyState judul="Pegawai tidak ditemukan pada cakupan Anda." keterangan="Pegawai mungkin bukan anggota tim Anda pada periode yang dipilih." />
        </Halaman>
      );
    }
    throw e;
  }
  if (!p) notFound();

  const opsiPeriode = await db.periode.findMany({ select: { id: true, tahun: true, bulan: true }, orderBy: [{ tahun: "desc" }, { bulan: "desc" }] });
  // Semua hari Senin–Jumat dalam bulan; yang bukan hari kerja efektif = libur nasional/cuti bersama.
  const perTanggal = new Map(p.kalender.map((k) => [k.tanggal, k]));
  const hariBulan = new Date(Date.UTC(p.periode.tahun, p.periode.bulan, 0)).getUTCDate();
  const sel = Array.from({ length: hariBulan }, (_, i) => new Date(Date.UTC(p.periode.tahun, p.periode.bulan - 1, i + 1)))
    .filter((d) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5)
    .map((d) => d.toISOString().slice(0, 10));
  const awalMinggu = sel.length ? new Date(`${sel[0]}T00:00:00Z`).getUTCDay() - 1 : 0;
  const maksEntri = Math.max(1, ...p.riwayat.map((r) => r.entri));

  return (
    <Halaman lebar="max-w-6xl">
      <Link href="/dashboard" className="btn btn-ghost -ml-3 -mb-2 text-xs">
        <IkonKiri className="h-4 w-4" /> Dashboard
      </Link>

      {/* Identitas */}
      <section className="panel overflow-hidden">
        <div className="relative flex flex-wrap items-center gap-4 bg-muted px-5 py-5 sm:px-6">
          <span aria-hidden className="relative flex size-14 shrink-0 items-center justify-center rounded-2xl bg-background text-lg font-semibold ring-1 ring-border">
            {inisial(p.pegawai.nama)}
          </span>
          <div className="relative min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Profil pegawai</p>
            <h1 className="truncate text-xl font-medium sm:text-2xl">{p.pegawai.nama}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              NIP {p.pegawai.nip}
              {p.pegawai.jabatan && <> · {p.pegawai.jabatan}</>}
              {!p.pegawai.isActive && <> · <span className="text-red-700">nonaktif</span></>}
            </p>
            <p className="mt-1 text-xs text-side-200">{p.tim.join(", ")}</p>
          </div>
          <div className="relative rounded-xl bg-surface p-2">
            <PilihPeriode nilai={p.periode.id} opsi={opsiPeriode} />
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(n+3)]:border-line max-sm:[&>*:nth-child(even)]:border-l max-sm:[&>*:nth-child(even)]:border-line">
          <Statistik label="Kepatuhan" nilai={desimal(p.ringkas.persenKepatuhan)} ket={`${p.ringkas.hariTerisi} dari ${p.ringkas.hariKerjaBerlalu} hari kerja`} />
          <Statistik label="Entri" nilai={String(p.ringkas.entri)} ket={`${BULAN[p.periode.bulan - 1]} ${p.periode.tahun}`} />
          <Statistik label="Disetujui" nilai={desimal(p.ringkas.persenDisetujui)} ket={`${p.ringkas.disetujui} entri`} />
          <Statistik label="Perlu tindak lanjut" nilai={String(p.ringkas.menunggu + p.ringkas.revisi)} ket={`${p.ringkas.menunggu} menunggu · ${p.ringkas.revisi} revisi`} />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Kalender kepatuhan */}
        <section aria-labelledby="h-kal" className="panel p-4 sm:p-5">
          <h2 id="h-kal" className="text-[15px] font-semibold">Kalender pengisian</h2>
          <p className="mb-4 mt-0.5 text-xs text-ink-muted">Hari kerja {BULAN[p.periode.bulan - 1]} {p.periode.tahun}. Garis putus = belum berjalan; arsir = libur.</p>
          <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] text-ink-muted" aria-hidden>
            {["Sen", "Sel", "Rab", "Kam", "Jum"].map((h) => <span key={h}>{h}</span>)}
          </div>
          <ol className="mt-1.5 grid grid-cols-5 gap-1.5">
            {Array.from({ length: awalMinggu }).map((_, i) => <li key={`k${i}`} aria-hidden />)}
            {sel.map((t) => {
              const k = perTanggal.get(t);
              if (!k) {
                return (
                  <li key={t} title={`${labelTanggal(t)}: libur`} className="flex h-12 items-center justify-center rounded-lg bg-[repeating-linear-gradient(135deg,var(--color-gray-100)_0_4px,transparent_4px_8px)] text-sm tabular-nums text-ink-muted/70">
                    <span className="sr-only">{labelTanggal(t)}: libur</span>
                    <span aria-hidden>{Number(t.slice(8))}</span>
                  </li>
                );
              }
              return (
              <li
                key={k.tanggal}
                className={`flex h-12 flex-col items-center justify-center rounded-lg text-sm font-medium tabular-nums ${
                  k.mendatang ? "border border-dashed border-line-strong bg-surface text-ink-muted" : SEL_CLS[k.sel]
                } ${k.tanggal === p.hariIni ? "ring-2 ring-gold-500 ring-offset-2" : ""}`}
                title={`${labelTanggal(k.tanggal)}: ${k.mendatang ? "belum berjalan" : SEL_LABEL[k.sel]}${k.jumlah ? ` (${k.jumlah} entri)` : ""}`}
              >
                <span className="sr-only">{labelTanggal(k.tanggal)}: {k.mendatang ? "belum berjalan" : SEL_LABEL[k.sel]}</span>
                <span aria-hidden>{Number(k.tanggal.slice(8))}</span>
                {k.jumlah > 1 && <span aria-hidden className="text-[9px] font-normal opacity-80">{k.jumlah}×</span>}
              </li>
              );
            })}
          </ol>
        </section>

        {/* Riwayat lintas periode */}
        <section aria-labelledby="h-riwayat" className="panel p-4 sm:p-5">
          <h2 id="h-riwayat" className="text-[15px] font-semibold">Riwayat {p.riwayat.length} periode</h2>
          <p className="mb-4 mt-0.5 text-xs text-ink-muted">Batang = jumlah entri; garis emas = kepatuhan pengisian.</p>
          {p.riwayat.length === 0 ? (
            <EmptyState kecil judul="Belum ada riwayat periode." />
          ) : (
            <>
              <div className="relative flex h-40 items-end justify-center gap-3" aria-hidden>
                {p.riwayat.map((r) => (
                  <div key={r.periodeId} className="relative flex h-full max-w-16 flex-1 flex-col justify-end">
                    <span className="mb-1 text-center text-[11px] tabular-nums text-ink-muted">{r.entri}</span>
                    <div className={`rounded-t-md ${r.periodeId === p.periode.id ? "bg-brand-600" : "bg-brand-200"}`} style={{ height: `${(r.entri / maksEntri) * 75}%`, minHeight: 2 }} />
                    {r.persenKepatuhan !== null && (
                      <span className="absolute left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-surface bg-gold-500" style={{ bottom: `${r.persenKepatuhan}%` }} />
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex justify-center gap-3" aria-hidden>
                {p.riwayat.map((r) => (
                  <span key={r.periodeId} className={`max-w-16 flex-1 text-center text-[11px] ${r.periodeId === p.periode.id ? "font-semibold text-brand-800" : "text-ink-muted"}`}>
                    {BULAN3[r.bulan - 1]} {String(r.tahun).slice(2)}
                  </span>
                ))}
              </div>
              <div className="relative mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Riwayat capaian per periode</caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-2 py-1.5 text-left">Periode</th>
                    <th scope="col" className="px-2 py-1.5 text-right">Jumlah</th>
                    <th scope="col" className="px-2 py-1.5 text-right">Kepatuhan</th>
                    <th scope="col" className="px-2 py-1.5 text-right">Disetujui</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...p.riwayat].reverse().map((r) => (
                    <tr key={r.periodeId}>
                      <th scope="row" className="px-2 py-1.5 text-left font-normal">{BULAN[r.bulan - 1]} {r.tahun}</th>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.entri}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{desimal(r.persenKepatuhan)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{desimal(r.persenDisetujui)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Alokasi */}
      <section aria-labelledby="h-alokasi" className="panel p-4 sm:p-5">
        <h2 id="h-alokasi" className="text-[15px] font-semibold">Progres alokasi</h2>
        <p className="mb-4 mt-0.5 text-xs text-ink-muted">Capaian disetujui terhadap target penugasan periode ini.</p>
        {p.alokasi.length === 0 ? (
          <EmptyState kecil judul="Belum ada alokasi untuk pegawai ini." keterangan="Ketua tim membuat alokasi di menu Alokasi." />
        ) : (
          <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {p.alokasi.map((a) => (
              <li key={a.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">{a.judul}</p>
                  <span className="shrink-0 text-[11px] text-ink-muted">Prioritas {PRIORITAS[a.prioritas] ?? a.prioritas}</span>
                </div>
                <p className="mb-1 text-xs text-ink-muted">
                  {angkaRingkas(String(a.realisasi))} / {angkaRingkas(String(a.target))} {a.satuan}
                  {a.menunggu > 0 && <span className="text-gold-700"> (+{angkaRingkas(String(a.menunggu))} menunggu)</span>} · {a.tim}
                </p>
                <ProgressBar persen={a.persen} label={`Progres ${a.judul}`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Entri */}
      <section aria-labelledby="h-entri" className="space-y-2">
        <h2 id="h-entri" className="text-[15px] font-semibold">Catatan pekerjaan ({p.entri.length})</h2>
        {p.entri.length === 0 ? (
          <div className="panel"><EmptyState judul="Belum ada catatan pada periode ini." /></div>
        ) : (
          <ul className="space-y-2">
            {p.entri.map((e) => (
              <li key={e.id} className="panel p-4" data-entri={e.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{e.alokasi?.judul ?? `${e.judulAdHoc} (tugas tambahan)`}</span>
                  <StatusBadge status={e.statusVerifikasi} />
                </div>
                <p className="text-xs text-ink-muted">{labelTanggal(e.tanggal)}</p>
                <p className="mt-1 text-sm">{e.deskripsiCapaian}</p>
                <p className="text-xs text-ink-soft">
                  {angkaRingkas(e.volume)} {e.satuan}
                  {e.kendala && <> · Kendala: {e.kendala}</>}
                </p>
                {e.verifikasi.length > 0 && (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    Verifikasi terakhir: {e.verifikasi[e.verifikasi.length - 1].verifikator.nama}
                    {e.verifikasi[e.verifikasi.length - 1].catatan && <> — “{e.verifikasi[e.verifikasi.length - 1].catatan}”</>}
                  </p>
                )}
                <div className="mt-1.5">
                  <IndikatorBukti jumlah={e.jumlahBukti} />
                  {e.bukti.length > 0 && <div className="mt-1"><DaftarBukti bukti={e.bukti} /></div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Halaman>
  );
}
