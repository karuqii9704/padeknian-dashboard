import { db } from "@/lib/db";
import { calonAnggota, daftarTim } from "@/lib/tim";
import { daftarPengguna, listQuerySchema } from "@/lib/users";
import { gerbangAdmin } from "../gerbang";
import { TimClient } from "./tim-client";

export const dynamic = "force-dynamic";

export default async function TimPage() {
  await gerbangAdmin();
  // Lima permintaan yang sebelumnya dikirim berurutan dari browser kini berjalan paralel di server.
  const [tims, ketua, calon, periodes] = await Promise.all([
    daftarTim(),
    daftarPengguna(listQuerySchema.parse({ role: "KETUA_TIM", aktif: "true", pageSize: "100" })),
    calonAnggota(), // tanpa batas halaman: pegawai ke-101 dst. tetap bisa ditambahkan
    db.periode.findMany({ orderBy: [{ tahun: "desc" }, { bulan: "desc" }] }),
  ]);
  const awal = JSON.parse(
    JSON.stringify({
      tims,
      ketuaOpsi: ketua.data,
      pegawai: calon,
      periodes,
    }),
  );
  return <TimClient awal={awal} />;
}
