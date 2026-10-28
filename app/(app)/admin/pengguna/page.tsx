import { daftarPengguna, listQuerySchema } from "@/lib/users";
import { AksesDitolak, gerbangAdmin } from "../gerbang";
import { PenggunaClient } from "./pengguna-client";

export const dynamic = "force-dynamic";

export default async function PenggunaPage() {
  const me = await gerbangAdmin();
  if (!me) return <AksesDitolak />;
  const awal = JSON.parse(JSON.stringify(await daftarPengguna(listQuerySchema.parse({ page: "1", pageSize: "20" }))));
  return <PenggunaClient meId={me.id} awal={{ rows: awal.data, total: awal.total }} />;
}
