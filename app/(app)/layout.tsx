import { jumlahPerluRevisi } from "@/lib/hari-ini";
import { jumlahMenunggu } from "@/lib/verifikasi";
import { penggunaSesi, requireSession } from "@/lib/rbac";
import { AppShell } from "./app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Layout hanya menampilkan navigasi; tiap halaman tetap melakukan otorisasinya sendiri.
  // Sesi di-memo per permintaan, jadi halaman tidak mengulang query pengguna yang sama.
  let nav: { nama: string; role: string; revisi: number; verifikasi: number } | null = null;
  try {
    const user = await requireSession({ allowMustChange: true });
    const [u, revisi, verifikasi] = await Promise.all([
      penggunaSesi(),
      user.role === "PEGAWAI" || user.role === "KETUA_TIM" ? jumlahPerluRevisi(user.id) : Promise.resolve(0),
      user.role === "KETUA_TIM" ? jumlahMenunggu(user) : Promise.resolve(0),
    ]);
    nav = { nama: u?.nama ?? "", role: user.role, revisi, verifikasi };
  } catch {
    nav = null;
  }
  if (!nav) return <>{children}</>;
  return (
    <AppShell nama={nav.nama} role={nav.role} revisi={nav.revisi} verifikasi={nav.verifikasi}>
      {children}
    </AppShell>
  );
}
