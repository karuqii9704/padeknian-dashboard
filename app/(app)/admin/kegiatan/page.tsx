import { daftarKegiatan } from "@/lib/kegiatan";
import { AksesDitolak, gerbangAdmin } from "../gerbang";
import { KegiatanClient } from "./kegiatan-client";

export const dynamic = "force-dynamic";

export default async function KegiatanPage() {
  if (!(await gerbangAdmin())) return <AksesDitolak />;
  const rows = JSON.parse(JSON.stringify(await daftarKegiatan({})));
  return <KegiatanClient awal={rows} />;
}
