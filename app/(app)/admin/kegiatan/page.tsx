import { daftarKegiatan } from "@/lib/kegiatan";
import { gerbangAdmin } from "../gerbang";
import { KegiatanClient } from "./kegiatan-client";

export const dynamic = "force-dynamic";

export default async function KegiatanPage() {
  await gerbangAdmin();
  const rows = JSON.parse(JSON.stringify(await daftarKegiatan({})));
  return <KegiatanClient awal={rows} />;
}
