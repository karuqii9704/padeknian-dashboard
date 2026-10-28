import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { daftarRekap } from "@/lib/rekap";
import { HttpError, requireRole } from "@/lib/rbac";
import { Halaman, PageHeader } from "../../ui/primitives";
import { RekapClient } from "./rekap-client";

export const dynamic = "force-dynamic";

export default async function RekapPage() {
  let me;
  try {
    me = await requireRole("ADMIN", "PIMPINAN", "KETUA_TIM");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    return (
      <Halaman lebar="max-w-xl">
        <PageHeader judul="Akses ditolak" keterangan="Rekap untuk Admin, Pimpinan, dan Ketua Tim." />
      </Halaman>
    );
  }
  // Periode + daftar rekap periode terpilih dirender di server (sebelumnya dua fetch berurutan di browser).
  const periodes = await db.periode.findMany({ orderBy: [{ tahun: "desc" }, { bulan: "desc" }] });
  const periodeId = (periodes.find((p) => p.status === "AKTIF") ?? periodes[0])?.id ?? "";
  const data = periodeId ? await daftarRekap(me, periodeId) : null;
  const awal = JSON.parse(JSON.stringify({ periodes, periodeId, data }));
  return <RekapClient role={me.role} awal={awal} />;
}
