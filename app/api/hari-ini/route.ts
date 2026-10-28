import { NextResponse } from "next/server";
import { ringkasanHariIni } from "@/lib/hari-ini";
import { handle, requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  return NextResponse.json(await ringkasanHariIni(user));
});
