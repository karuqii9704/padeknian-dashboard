import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { daftarAlokasi, listAlokasiQuery } from "@/lib/alokasi";
import { daftarKegiatan } from "@/lib/kegiatan";
import { daftarAnggota, daftarTim } from "@/lib/tim";
import { HttpError, requireSession } from "@/lib/rbac";
import { AlokasiClient } from "./alokasi-client";

export const dynamic = "force-dynamic";

export default async function AlokasiPage() {
  let user;
  try {
    user = await requireSession();
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403) redirect("/ganti-password");
    throw e;
  }

  // Data awal dirender di server: sebelumnya klien memuat periode/tim/kegiatan, lalu alokasi, lalu anggota (3 putaran berurutan).
  const [periodes, semuaTim, kegiatan] = await Promise.all([
    db.periode.findMany({ orderBy: [{ tahun: "desc" }, { bulan: "desc" }] }),
    daftarTim(),
    daftarKegiatan({ aktif: "true" }),
  ]);
  const tims = user.role === "KETUA_TIM" ? semuaTim.filter((t) => t.ketua.id === user.id) : semuaTim;
  const periodeId = (periodes.find((p) => p.status === "AKTIF") ?? periodes[0])?.id ?? "";
  const timId = tims[0]?.id ?? "";

  const [rows, anggota] = await Promise.all([
    periodeId ? daftarAlokasi(user, listAlokasiQuery.parse({ periodeId, ...(timId ? { timId } : {}) })) : Promise.resolve({ data: [] }),
    user.role === "KETUA_TIM" && timId && periodeId ? daftarAnggota(timId, periodeId) : Promise.resolve(null),
  ]);

  const awal = JSON.parse(
    JSON.stringify({ periodes, tims, kegiatan, periodeId, timId, rows: rows.data, anggota: anggota && anggota.ok ? anggota.anggota : [] }),
  );
  return <AlokasiClient meId={user.id} role={user.role} awal={awal} />;
}
