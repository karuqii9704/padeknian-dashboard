import { db } from "@/lib/db";
import { daftarHariLibur } from "@/lib/periode";
import { pemakaianStorage } from "@/lib/pemakaian-storage";
import { PemakaianStorageView } from "./pemakaian-storage";
import { gerbangAdmin } from "../gerbang";
import { PeriodeClient } from "./periode-client";

export const dynamic = "force-dynamic";

export default async function PeriodePage() {
  await gerbangAdmin();
  const tahun = new Date().getFullYear();
  const [periodes, libur, storage] = await Promise.all([
    db.periode.findMany({ orderBy: [{ tahun: "desc" }, { bulan: "desc" }] }),
    daftarHariLibur(tahun),
    pemakaianStorage(),
  ]);
  return (
    <>
      <PeriodeClient awal={JSON.parse(JSON.stringify({ periodes, libur, tahun }))} />
      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <PemakaianStorageView data={storage} />
      </div>
    </>
  );
}
