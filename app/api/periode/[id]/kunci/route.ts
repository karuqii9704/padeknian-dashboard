import { NextResponse } from "next/server";
import { kunciPeriode } from "@/lib/periode-kunci";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("ADMIN", "PIMPINAN");
  const id = parseParam((await ctx.params).id, uuidSchema, "Periode tidak ditemukan.");
  const r = await kunciPeriode(user, id, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ periode: r.periode, rekapFinal: r.rekapFinal });
});
