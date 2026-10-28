import { redirect } from "next/navigation";
import { ringkasanHariIni } from "@/lib/hari-ini";
import { daftarEntri, listEntriQuery } from "@/lib/pekerjaan";
import { HttpError, requireRole } from "@/lib/rbac";
import { Halaman, PageHeader } from "../../ui/primitives";
import { RevisiClient } from "./revisi-client";

export const dynamic = "force-dynamic";

export default async function RevisiPage() {
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
  // Satu putaran di server (sebelumnya 3 fetch berurutan di browser: /api/me lalu entri + konteks).
  const [entri, hi] = await Promise.all([
    daftarEntri(user, listEntriQuery.parse({ perluTindakan: "true", userId: user.id, pageSize: "200" })),
    ringkasanHariIni(user),
  ]);
  const awal = JSON.parse(
    JSON.stringify({ rows: entri.data, konteks: { hariIni: hi.hariIni, tanggalBolehDicatat: hi.tanggalBolehDicatat, alokasi: hi.alokasi } }),
  );
  return <RevisiClient userId={user.id} awal={awal} />;
}
