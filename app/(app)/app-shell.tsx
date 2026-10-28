"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Lambang } from "../brand";
import {
  IkonAlokasi,
  IkonDashboard,
  IkonHariIni,
  IkonKalender,
  IkonKegiatan,
  IkonKeluar,
  IkonPengguna,
  IkonPeriode,
  IkonRekap,
  IkonRevisi,
  IkonTim,
  IkonVerifikasi,
} from "../ui/icons";
import { inisial } from "../ui/inisial";
import { NotifikasiBell } from "./notifikasi-bell";

type Item = { href: string; label: string; ikon: (p: { className?: string }) => React.ReactElement; badge?: number; warna?: "merah" | "emas" };
type Grup = { judul: string; item: Item[] };

const ROLE_LABEL: Record<string, string> = { PEGAWAI: "Pegawai", KETUA_TIM: "Ketua Tim", PIMPINAN: "Pimpinan", ADMIN: "Admin" };

function menu(role: string, revisi: number, verifikasi: number): Grup[] {
  const hariIni: Item = { href: "/hari-ini", label: "Hari Ini", ikon: IkonHariIni };
  const kalender: Item = { href: "/kalender", label: "Kalender", ikon: IkonKalender };
  const rev: Item = { href: "/revisi", label: "Revisi", ikon: IkonRevisi, badge: revisi, warna: "merah" };
  const alokasi: Item = { href: "/alokasi", label: "Alokasi", ikon: IkonAlokasi };
  const dashboard: Item = { href: "/dashboard", label: "Dashboard", ikon: IkonDashboard };
  const rekap: Item = { href: "/rekap", label: "Rekap", ikon: IkonRekap };

  if (role === "PEGAWAI") return [{ judul: "Pekerjaan saya", item: [hariIni, kalender, rev, alokasi] }];
  if (role === "KETUA_TIM") {
    return [
      { judul: "Pekerjaan saya", item: [hariIni, kalender, rev] },
      { judul: "Tim", item: [{ href: "/verifikasi", label: "Verifikasi", ikon: IkonVerifikasi, badge: verifikasi, warna: "emas" }, dashboard, alokasi] },
      { judul: "Laporan", item: [rekap] },
    ];
  }
  if (role === "ADMIN") {
    return [
      {
        judul: "Data induk",
        item: [
          { href: "/admin/pengguna", label: "Pengguna", ikon: IkonPengguna },
          { href: "/admin/tim", label: "Tim", ikon: IkonTim },
          { href: "/admin/periode", label: "Periode", ikon: IkonPeriode },
          { href: "/admin/kegiatan", label: "Kegiatan", ikon: IkonKegiatan },
        ],
      },
      { judul: "Laporan", item: [rekap, alokasi] },
    ];
  }
  return [{ judul: "Pemantauan", item: [dashboard, alokasi] }, { judul: "Laporan", item: [rekap] }];
}

/**
 * Kerangka aplikasi (liquid glass). Satu elemen navigasi "Menu utama" yang tampil sebagai dok kaca di kiri
 * pada desktop (lg) dan sebagai dok mengambang di bawah pada HP/tablet, sehingga badge revisi/verifikasi
 * selalu terlihat tanpa membuka menu.
 */
export function AppShell({ nama, role, revisi, verifikasi, children }: { nama: string; role: string; revisi: number; verifikasi: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function keluar() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const grup = menu(role, revisi, verifikasi);

  return (
    <div className="min-h-[100dvh] pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8 lg:pl-[7.25rem]">
      <nav
        aria-label="Menu utama"
        className="nav-scroll fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 flex animate-[riseIn_0.7s_var(--e-out)_0.05s_both] overflow-x-auto rounded-[1.375rem] border border-glass bg-[linear-gradient(180deg,rgb(255_255_255/0.2),rgb(255_255_255/0.13))] shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_12px_32px_-12px_rgb(0_0_0/0.6)] backdrop-blur-[18px] backdrop-saturate-[1.15] lg:inset-x-auto lg:bottom-[0.45rem] lg:left-4 lg:top-3.5 lg:w-[4.5rem] lg:animate-[slideL_0.92s_var(--e-out)_0.05s_both] lg:flex-col lg:items-center lg:overflow-y-auto lg:rounded-[1.625rem] lg:px-2 lg:pb-5 lg:pt-5 lg:[background:linear-gradient(180deg,rgb(255_255_255/0.125)_0%,rgb(255_255_255/0.135)_13%,rgb(255_255_255/0.098)_34%,rgb(255_255_255/0.092)_100%)]"
      >
        <Link href="/" aria-label="Beranda" className="hidden shrink-0 animate-[popIn_0.7s_var(--e-out)_0.26s_both] rounded-xl lg:block">
          <Lambang ukuran={40} />
        </Link>

        <div className="flex flex-1 items-stretch lg:mt-6 lg:w-full lg:flex-none lg:flex-col lg:gap-1">
          {grup.map((g, gi) => (
            <ul key={g.judul} aria-label={g.judul} className={`flex flex-1 items-stretch lg:flex-none lg:flex-col lg:gap-1 ${gi > 0 ? "lg:mt-2 lg:border-t lg:border-white/15 lg:pt-3" : ""}`}>
              {g.item.map((m, mi) => {
                const aktif = pathname === m.href || pathname.startsWith(`${m.href}/`);
                const Ikon = m.ikon;
                return (
                  <li key={m.href} className="flex min-w-[4.5rem] flex-1 lg:min-w-0 lg:flex-none" style={{ animation: `riseIn 0.6s var(--e-out) ${0.36 + (gi * 3 + mi) * 0.05}s both` }}>
                    <Link
                      href={m.href}
                      aria-current={aktif ? "page" : undefined}
                      className={`group relative flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10.5px] leading-none tracking-tight transition-[opacity,transform,background-color] duration-200 hover:-translate-y-px hover:opacity-100 ${
                        aktif ? "bg-white/15 font-semibold text-white opacity-100" : "text-white opacity-80 hover:bg-white/10"
                      }`}
                    >
                      {aktif && <span aria-hidden className="nav-item-aktif-pip absolute inset-x-5 top-0 h-[3px] rounded-b bg-white shadow-[0_0_10px_rgb(255_255_255/0.55)] lg:inset-x-auto lg:inset-y-3.5 lg:-left-[10px] lg:h-auto lg:w-[5px] lg:rounded-b-none lg:rounded-r-[3px]" />}
                      <span className="relative">
                        <Ikon className="h-[22px] w-[22px] lg:h-[23px] lg:w-[23px]" />
                        {!!m.badge && (
                          <span
                            aria-label={m.warna === "emas" ? `${m.badge} menunggu verifikasi` : `${m.badge} perlu revisi`}
                            className={`absolute -right-2.5 -top-1.5 min-w-[1.15rem] rounded-full px-1 text-center text-[10px] font-semibold leading-[1.15rem] tabular-nums ${
                              m.warna === "emas" ? "bg-gold-400 text-brand-950" : "bg-red-600 text-white"
                            }`}
                          >
                            {m.badge}
                          </span>
                        )}
                      </span>
                      <span className="whitespace-nowrap">{m.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>

        <button
          type="button"
          onClick={keluar}
          title="Keluar"
          className="hidden size-12 shrink-0 animate-[riseIn_0.6s_var(--e-out)_0.7s_both] items-center justify-center rounded-2xl text-white opacity-80 transition-[opacity,background-color] hover:bg-white/10 hover:opacity-100 lg:mt-auto lg:flex"
        >
          <IkonKeluar className="h-[23px] w-[23px]" />
          <span className="sr-only">Keluar</span>
        </button>
      </nav>

      <header className="relative z-30 flex items-center gap-3 px-4 pb-1 pt-3 sm:px-6 lg:mb-6 lg:h-[4.75rem] lg:px-9 lg:pb-0 lg:pt-[1.375rem]">
        <Link href="/" aria-label="Beranda" className="flex items-center gap-2.5 lg:hidden">
          <Lambang ukuran={36} />
          <span className="leading-tight">
            <span className="block text-sm font-semibold">BPS Kerinci</span>
            <span className="block text-[11px] text-ink-muted">{ROLE_LABEL[role]}</span>
          </span>
        </Link>
        <p className="hidden leading-none lg:block">
          <span className="block animate-[riseIn_0.7s_var(--e-out)_0.14s_both] text-base text-white/90">Selamat datang</span>
          <span className="mt-[0.8125rem] block animate-[riseIn_0.8s_var(--e-out)_0.22s_both] text-[1.2rem] font-bold tracking-[-0.02em]">{nama}</span>
        </p>
        <div className="ml-auto flex items-center gap-2 lg:gap-4">
          <span className="animate-[popIn_0.58s_var(--e-out)_0.3s_both]">
            <NotifikasiBell />
          </span>
          <span
            aria-hidden
            title={`${nama} · ${ROLE_LABEL[role]}`}
            className="hidden size-11 animate-[popIn_0.58s_var(--e-out)_0.43s_both] items-center justify-center rounded-full border border-glass bg-white/15 text-sm font-semibold backdrop-blur-xl sm:flex lg:size-[3.25rem]"
          >
            {inisial(nama)}
          </span>
          <button type="button" onClick={keluar} title="Keluar" className="tool lg:hidden">
            <IkonKeluar className="h-5 w-5" />
            <span className="sr-only">Keluar</span>
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}
