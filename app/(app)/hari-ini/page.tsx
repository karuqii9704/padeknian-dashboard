import { redirect } from "next/navigation";
import { ringkasanHariIni } from "@/lib/hari-ini";
import { HttpError, requireRole } from "@/lib/rbac";
import { Halaman, PageHeader } from "../../ui/primitives";
import { HariIniClient } from "./hari-ini-client";

export const dynamic = "force-dynamic";

export default async function HariIniPage({ searchParams }: { searchParams: Promise<{ catat?: string; tanggal?: string }> }) {
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
  // Data awal dirender server; klien hanya memuat ulang setelah ada perubahan.
  const { catat, tanggal } = await searchParams;
  const awal = JSON.parse(JSON.stringify(await ringkasanHariIni(user)));
  return <HariIniClient awal={awal} bukaForm={catat === "1"} tanggalAwal={tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : undefined} />;
}
