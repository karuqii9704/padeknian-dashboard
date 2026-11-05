import { NextResponse } from "next/server";
import { dashboardQuery, ringkasanKpi } from "@/lib/dashboard";
import { handle, requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const user = await requireRole("KETUA_TIM", "PIMPINAN", "ADMIN");
  const parsed = dashboardQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  const r = await ringkasanKpi(user, parsed.data);
  if (!r) return NextResponse.json({ pesan: "Belum ada periode aktif." }, { status: 404 });
  return NextResponse.json(r);
});
