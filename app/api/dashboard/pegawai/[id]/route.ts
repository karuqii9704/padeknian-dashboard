import { NextResponse } from "next/server";
import { entriPegawai } from "@/lib/dashboard-pegawai";
import { dashboardQuery } from "@/lib/dashboard";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("KETUA_TIM", "PIMPINAN", "ADMIN");
  const id = parseParam((await ctx.params).id, uuidSchema, "Pegawai tidak ditemukan.");
  const parsed = dashboardQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  const r = await entriPegawai(user, id, parsed.data);
  if (!r) return NextResponse.json({ pesan: "Belum ada periode aktif." }, { status: 404 });
  return NextResponse.json(r);
});
