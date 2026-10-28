import { db } from "@/lib/db";
import { daftarTim } from "@/lib/tim";
import { daftarPengguna, listQuerySchema } from "@/lib/users";
import { AksesDitolak, gerbangAdmin } from "../gerbang";
import { TimClient } from "./tim-client";

export const dynamic = "force-dynamic";

export default async function TimPage() {
  if (!(await gerbangAdmin())) return <AksesDitolak />;
  // Lima permintaan yang sebelumnya dikirim berurutan dari browser kini berjalan paralel di server.
  const [tims, ketua, aktif, periodes] = await Promise.all([
    daftarTim(),
    daftarPengguna(listQuerySchema.parse({ role: "KETUA_TIM", aktif: "true", pageSize: "100" })),
    daftarPengguna(listQuerySchema.parse({ aktif: "true", pageSize: "100" })),
    db.periode.findMany({ orderBy: [{ tahun: "desc" }, { bulan: "desc" }] }),
  ]);
  const awal = JSON.parse(
    JSON.stringify({
      tims,
      ketuaOpsi: ketua.data,
      pegawai: aktif.data.filter((u) => u.role === "PEGAWAI" || u.role === "KETUA_TIM"),
      periodes,
    }),
  );
  return <TimClient awal={awal} />;
}
