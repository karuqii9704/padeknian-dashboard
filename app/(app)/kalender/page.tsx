import { forbidden, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { kalenderSaya, ringkasanHariIni } from "@/lib/hari-ini";
import { HttpError, requireRole } from "@/lib/rbac";

import { KalenderClient } from "./kalender-client";

export const dynamic = "force-dynamic";

export default async function KalenderPage() {
  let user;
  try {
    user = await requireRole("PEGAWAI", "KETUA_TIM");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    forbidden(); // HTTP 403 + app/(app)/forbidden.tsx
  }
  const [kal, hi, periodes] = await Promise.all([
    kalenderSaya(user),
    ringkasanHariIni(user),
    db.periode.findMany({ select: { id: true, tahun: true, bulan: true }, orderBy: [{ tahun: "asc" }, { bulan: "asc" }] }),
  ]);
  const awal = JSON.parse(
    JSON.stringify({ kal, periodes, konteks: { hariIni: hi.hariIni, tanggalBolehDicatat: hi.tanggalBolehDicatat, alokasi: hi.alokasi } }),
  );
  return <KalenderClient awal={awal} />;
}
