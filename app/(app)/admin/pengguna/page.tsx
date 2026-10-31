import { ambilAnalitikPegawai } from "@/lib/pegawai-insight";
import { daftarPengguna, listQuerySchema } from "@/lib/users";
import { AksesDitolak, gerbangAdmin } from "../gerbang";
import { PenggunaClient } from "./pengguna-client";

export const dynamic = "force-dynamic";

export default async function PenggunaPage() {
  const me = await gerbangAdmin();
  if (!me) return <AksesDitolak />;
  const [awal, analitik] = await Promise.all([
    daftarPengguna(listQuerySchema.parse({ page: "1", pageSize: "20" })),
    ambilAnalitikPegawai(),
  ]);
  // BigInt tidak dapat diserialisasi ke client component.
  const awalJson = JSON.parse(JSON.stringify(awal));
  const analitikJson = JSON.parse(JSON.stringify(analitik));
  return <PenggunaClient meId={me.id} awal={{ rows: awalJson.data, total: awalJson.total }} analitik={analitikJson} />;
}
