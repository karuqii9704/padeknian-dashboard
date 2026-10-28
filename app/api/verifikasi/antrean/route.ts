import { NextResponse } from "next/server";
import { antreanQuery, antreanVerifikasi } from "@/lib/verifikasi";
import { handle, requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const user = await requireRole("KETUA_TIM");
  const parsed = antreanQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  return NextResponse.json(await antreanVerifikasi(user, parsed.data));
});
