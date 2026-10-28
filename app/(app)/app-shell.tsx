"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOutIcon, MoonIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, SunIcon } from "lucide-react";
import { Lambang } from "../brand";
import { useTema } from "../theme";
import {
  IkonAlokasi,
  IkonDashboard,
  IkonHariIni,
  IkonKalender,
  IkonKegiatan,
  IkonPengguna,
  IkonPeriode,
  IkonRekap,
  IkonRevisi,
  IkonTim,
  IkonVerifikasi,
} from "../ui/icons";
import { inisial } from "../ui/inisial";
import { NotifikasiBell } from "./notifikasi-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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

const aktifUntuk = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

// Gaya tombol menu mengikuti Bionis: item aktif menjadi "kartu" putih dengan bayangan halus.
const tombolMenu = cn(
  "h-11 gap-2.5 rounded-xl border border-transparent px-3 text-[15px] tracking-tight text-muted-foreground transition-colors",
  "data-[active=true]:border-border data-[active=true]:bg-background data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[1px_2px_12px_rgba(158,158,158,0.08)]",
  "dark:data-[active=true]:border-transparent dark:data-[active=true]:bg-sidebar-accent",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&_svg]:size-5!",
  "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:[&>span]:hidden",
);

function ItemMenu({ m }: { m: Item }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const aktif = aktifUntuk(pathname, m.href);
  const Ikon = m.ikon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={aktif} tooltip={m.label} className={tombolMenu}>
        <Link href={m.href} aria-current={aktif ? "page" : undefined} onClick={() => isMobile && setOpenMobile(false)}>
          <Ikon />
          <span>{m.label}</span>
        </Link>
      </SidebarMenuButton>
      {!!m.badge && (
        <SidebarMenuBadge
          aria-label={m.warna === "emas" ? `${m.badge} menunggu verifikasi` : `${m.badge} perlu revisi`}
          className={cn(
            "top-1/2 -translate-y-1/2 rounded-md px-1.5 text-xs font-medium tabular-nums",
            m.warna === "emas" ? "bg-gold-100 text-gold-700" : "bg-red-100 text-red-700",
          )}
        >
          {m.badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

function KepalaSidebar() {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const ciut = state === "collapsed" && !isMobile;
  return (
    <SidebarHeader className={cn("h-16 flex-row items-center border-b border-sidebar-border md:h-20", ciut ? "justify-center px-2" : "justify-between gap-3 px-4")}>
      {!ciut && (
        <Link href="/" aria-label="Beranda" className="flex min-w-0 items-center gap-2.5">
          <Lambang ukuran={22} className="shrink-0" />
          <span className="truncate text-lg font-semibold tracking-tight">BPS Kerinci</span>
        </Link>
      )}
      {!isMobile && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={ciut ? "Lebarkan menu" : "Ciutkan menu"}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          {ciut ? <PanelLeftOpenIcon className="size-5" /> : <PanelLeftCloseIcon className="size-5" />}
        </button>
      )}
    </SidebarHeader>
  );
}

function ItemTema() {
  const { tema, gantiTema } = useTema();
  const gelap = tema === "dark";
  const label = gelap ? "Mode terang" : "Mode gelap";
  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={label} onClick={gantiTema} className={tombolMenu}>
        {gelap ? <SunIcon /> : <MoonIcon />}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ItemKeluar({ onKeluar }: { onKeluar: () => void }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip="Keluar" onClick={onKeluar} className={tombolMenu}>
        <LogOutIcon />
        <span>Keluar</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function JudulHalaman({ grup }: { grup: Grup[] }) {
  const pathname = usePathname();
  const item = grup.flatMap((g) => g.item).find((m) => aktifUntuk(pathname, m.href));
  if (!item) return <p className="truncate text-lg font-medium">BPS Kerinci</p>;
  const Ikon = item.ikon;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Ikon className="hidden size-5 shrink-0 md:block" />
      <p className="truncate text-lg font-medium">{item.label}</p>
    </div>
  );
}

/**
 * Kerangka aplikasi bergaya Bionis: sidebar (ciut ke ikon di desktop, laci geser di HP) dan topbar berisi
 * judul halaman, lonceng notifikasi, serta menu profil. Badge revisi/verifikasi tampil di item menu.
 */
export function AppShell({ nama, role, revisi, verifikasi, children }: { nama: string; role: string; revisi: number; verifikasi: number; children: React.ReactNode }) {
  const router = useRouter();
  const grup = menu(role, revisi, verifikasi);

  async function keluar() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <SidebarProvider defaultOpen style={{ "--sidebar-width": "16.5rem", "--sidebar-width-icon": "4.25rem" } as React.CSSProperties}>
      <Sidebar collapsible="icon" className="border-none">
        <KepalaSidebar />
        <SidebarContent className="gap-4 px-3 py-4">
          <nav aria-label="Menu utama" className="flex flex-col gap-4">
            {grup.map((g) => (
              <SidebarGroup key={g.judul} className="gap-1.5 p-0">
                <SidebarGroupLabel className="h-auto px-3 py-1 text-sm font-normal tracking-tight text-muted-foreground">{g.judul}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1.5">
                    {g.item.map((m) => (
                      <ItemMenu key={m.href} m={m} />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
          <SidebarMenu className="gap-1.5">
            <ItemTema />
            <ItemKeluar onKeluar={keluar} />
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur md:h-20 md:pl-6 md:pr-8">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SidebarTrigger className="size-11 shrink-0 md:hidden [&_svg]:size-5!" aria-label="Buka menu" />
            <JudulHalaman grup={grup} />
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <NotifikasiBell />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Menu profil">
                <span aria-hidden className="flex size-11 items-center justify-center rounded-lg bg-muted text-sm font-semibold">
                  {inisial(nama)}
                </span>
                <span className="hidden flex-col items-start gap-1 text-left md:flex">
                  <span className="text-[15px] font-medium leading-none">{nama}</span>
                  <span className="flex items-center gap-1.5 text-sm leading-none text-muted-foreground">
                    {ROLE_LABEL[role]}
                    <span aria-hidden className="block size-1.5 rounded-full bg-live" />
                  </span>
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium text-foreground">{nama}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABEL[role]}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/ganti-password">Ganti password</Link>
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={keluar}>
                  <LogOutIcon />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </SidebarProvider>
  );
}
