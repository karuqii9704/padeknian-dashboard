import { db } from "@/lib/db";
import { daftarHariLibur } from "@/lib/periode";
import { AksesDitolak, gerbangAdmin } from "../gerbang";
import { PeriodeClient } from "./periode-client";

export const dynamic = "force-dynamic";

export default async function PeriodePage() {
  if (!(await gerbangAdmin())) return <AksesDitolak />;
  const tahun = new Date().getFullYear();
  const [periodes, libur] = await Promise.all([
    db.periode.findMany({ orderBy: [{ tahun: "desc" }, { bulan: "desc" }] }),
    daftarHariLibur(tahun),
  ]);
  return <PeriodeClient awal={JSON.parse(JSON.stringify({ periodes, libur, tahun }))} />;
}
