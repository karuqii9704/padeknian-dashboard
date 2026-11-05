import { NextResponse } from "next/server";
import { dashboardLengkap } from "@/lib/dashboard-lengkap";
import { pegawaiQuery } from "@/lib/dashboard-pegawai";
import { handle, requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** KPI + tabel pegawai + analitik dalam satu respons (cakupan dihitung sekali). */
export const GET = handle(async (req: Request) => {
  const user = await requireRole("KETUA_TIM", "PIMPINAN", "ADMIN");
  const parsed = pegawaiQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  const r = await dashboardLengkap(user, parsed.data);
  if (!r) return NextResponse.json({ pesan: "Belum ada periode aktif." }, { status: 404 });
  return NextResponse.json(r);
});
