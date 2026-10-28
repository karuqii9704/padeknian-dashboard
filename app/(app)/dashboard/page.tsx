import { redirect } from "next/navigation";
import { dashboardLengkap, opsiFilterDashboard } from "@/lib/dashboard-lengkap";
import { HttpError, requireRole } from "@/lib/rbac";
import { Halaman, PageHeader } from "../../ui/primitives";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let me;
  try {
    me = await requireRole("KETUA_TIM", "PIMPINAN");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    return (
      <Halaman lebar="max-w-xl">
        <PageHeader judul="Akses ditolak" keterangan="Dashboard untuk Ketua Tim dan Pimpinan." />
      </Halaman>
    );
  }
  // Render server: data awal langsung ikut HTML (tanpa layar kosong / waterfall fetch di browser).
  const [opsi, awal] = await Promise.all([opsiFilterDashboard(me), dashboardLengkap(me, {})]);
  return <DashboardClient role={me.role} opsi={JSON.parse(JSON.stringify(opsi))} awal={awal ? JSON.parse(JSON.stringify(awal)) : null} />;
}
