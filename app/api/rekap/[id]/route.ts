import { NextResponse } from "next/server";
import { daftarRekap } from "@/lib/rekap";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

// Segmen [id] dipakai bersama oleh daftar (id = periode) dan unduhan (id = rekap); Next mewajibkan nama sama.

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole("ADMIN", "PIMPINAN", "KETUA_TIM");
  const periodeId = parseParam((await ctx.params).id, uuidSchema, "Periode tidak ditemukan.");
  return NextResponse.json(await daftarRekap(user, periodeId));
});
