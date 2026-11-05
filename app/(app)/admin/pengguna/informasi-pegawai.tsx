"use client";

import { useMemo, useState } from "react";
import type { AnalitikPegawai } from "@/lib/pegawai-insight";
import { wajibLapor } from "@/lib/wajib-lapor";
import { Alert, PageHeader } from "../../../ui/primitives";
import { DonatStatusVerifikasi, KelengkapanPegawai } from "./grafik-pegawai";
import { PemantauanHarian } from "./pemantauan-harian";
import { TombolPengingat } from "./tombol-pengingat";

/*
 * Section "Informasi Pegawai": ringkasan kondisi pegawai saat ini + insight otomatis +
 * grafik pendukung. Ini menggantikan daftar tabel sebagai tampilan utama; pengelolaan akun
 * (tambah/ubah/reset/nonaktifkan) tetap tersedia lewat tombol "Kelola akun".
 */

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const NADA_INSAIGHT = {
  galat: { kelas: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-[#1a0505] dark:text-red-200" },
  peringatan: { kelas: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-[#1a1200] dark:text-amber-200" },
  info: { kelas: "border-line bg-surface-muted text-ink-soft dark:border-border dark:bg-muted" },
} as const;

function KartuAngka({ label, nilai, keterangan, nada }: { label: string; nilai: number | string; keterangan?: string; nada?: "merah" | "emas" }) {
  return (
    <div className="panel flex min-w-0 flex-col gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-2xl font-medium tabular-nums ${
          nada === "merah" ? "text-red-600 dark:text-red-400" : nada === "emas" ? "text-gold-600 dark:text-gold-400" : ""
        }`}
      >
        {nilai}
      </span>
      {keterangan && <span className="text-xs text-muted-foreground">{keterangan}</span>}
    </div>
  );
}

/** Kartu insight: ikon + judul + keterangan. Dibuat sebagai <details> agar ringkas namun tetap terbaca. */
function KartuInsight({ insight }: { insight: AnalitikPegawai["insight"][number] }) {
  const n = NADA_INSAIGHT[insight.tingkat];
  return (
    <li className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${n.kelas}`}>
      <span
        aria-hidden
        className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          insight.tingkat === "galat"
            ? "bg-red-600 text-white dark:bg-red-400 dark:text-red-950"
            : insight.tingkat === "peringatan"
              ? "bg-amber-500 text-amber-950 dark:bg-amber-400 dark:text-amber-950"
              : "bg-brand-600 text-white dark:bg-brand-400 dark:text-brand-950"
        }`}
      >
        {insight.tingkat === "info" ? "i" : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{insight.judul}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{insight.keterangan}</p>
      </div>
    </li>
  );
}

/** Tab grafik: user bisa berpindah grafik tanpa memuat ulang halaman. */
const TAB = [
  { id: "tren", label: "Pemantauan harian" },
  { id: "kelengkapan", label: "Perlu diingatkan" },
  { id: "status", label: "Status verifikasi" },
] as const;
type TabId = (typeof TAB)[number]["id"];

export function InformasiPegawai({ data }: { data: AnalitikPegawai }) {
  const [tab, setTab] = useState<TabId>("tren");

  const labelPeriode = useMemo(() => {
    if (!data.periode) return "Belum ada periode aktif";
    return `${BULAN[data.periode.bulan - 1]} ${data.periode.tahun} · ${data.periode.status}`;
  }, [data.periode]);

  const r = data.ringkasan;
  const totalEntri = data.baris.reduce((a, b) => a + b.jumlahEntri, 0);
  const totalBukti = data.baris.reduce((a, b) => a + b.totalBukti, 0);
  const belumIsi = data.baris.filter((b) => wajibLapor(b) && b.jumlahEntri === 0 && b.hariKerjaBerlalu > 0).length;

  return (
    <section aria-labelledby="h-info-pegawai" className="space-y-5">
      <PageHeader
        eyebrow="Analitik"
        judul="Informasi Pegawai"
        keterangan={`Kondisi pegawai saat ini — ${labelPeriode}. ${data.hariKerja.berlalu} dari ${data.hariKerja.total} hari kerja sudah berjalan.`}
      />

      {/* Ringkasan angka */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KartuAngka label="Total pegawai" nilai={r.total} keterangan={`${r.aktif} aktif`} />
        <KartuAngka label="Peran" nilai={r.perPeran.length} keterangan={r.perPeran.map((p) => `${p.label} ${p.jumlah}`).join(" · ")} />
        <KartuAngka label="Entri periode ini" nilai={totalEntri} keterangan={`${totalBukti} bukti dukung`} />
        <KartuAngka label="Belum mengisi" nilai={belumIsi} nada={belumIsi > 0 ? "merah" : undefined} keterangan="pegawai tanpa catatan" />
        <KartuAngka label="Password sementara" nilai={r.wajibGantiPassword} nada={r.wajibGantiPassword > 0 ? "emas" : undefined} keterangan="belum diganti" />
        <KartuAngka label="Belum pernah login" nilai={r.belumPernahLogin} keterangan="akun belum aktif" />
      </div>

      {/* Insight otomatis + grafik.
          Urutan DOM: insight duluan supaya di layar sempit (mobile) kondisi terbaca dulu;
          di layar lebar (lg) grafik dipindah ke kiri & insight tetap di kanan (order).
          Insight dibungkus kartu panel agar sejajar & seimbang dengan kartu grafik. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Insight otomatis — kartu di kanan layar lebar, di atas di mobile */}
        <div className="panel order-1 lg:order-2 lg:sticky lg:top-6">
          <h3 id="h-insight" className="border-b px-4 pt-3.5 pb-3 text-[15px] font-semibold">
            Insight kondisi saat ini
          </h3>
          <div className="p-4 pt-3.5">
            {data.insight.length === 0 ? (
              <Alert nada="sukses">Tidak ada hal yang perlu perhatian saat ini.</Alert>
            ) : (
              <ul aria-labelledby="h-insight" className="grid gap-2.5">
                {data.insight.map((i) => (
                  <KartuInsight key={i.judul} insight={i} />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Grafik pendukung — kiri di layar lebar */}
        <div className="panel order-2 overflow-hidden lg:order-1">
          <div className="border-b px-4 pt-3.5">
            <div role="tablist" aria-label="Grafik pendukung" className="no-scrollbar flex gap-1 overflow-x-auto">
              {TAB.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={`min-h-10 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
                    tab === t.id
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <div role="tabpanel" id="panel-tren" aria-labelledby="tab-tren" hidden={tab !== "tren"}>
              <PemantauanHarian hari={data.kepatuhanHarian} />
            </div>
            <div role="tabpanel" id="panel-status" aria-labelledby="tab-status" hidden={tab !== "status"}>
              <DonatStatusVerifikasi data={data} />
            </div>
            <div role="tabpanel" id="panel-kelengkapan" aria-labelledby="tab-kelengkapan" hidden={tab !== "kelengkapan"}>
              <div className="space-y-4">
                <TombolPengingat />
                <KelengkapanPegawai baris={data.baris} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
