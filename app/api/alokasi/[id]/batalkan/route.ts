import { NextResponse } from "next/server";
import { batalkanAlokasi, batalkanSchema } from "@/lib/alokasi";
import { uuidSchema } from "@/lib/tim";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("KETUA_TIM");
  const id = parseParam((await ctx.params).id, uuidSchema, "Alokasi tidak ditemukan.");
  const { alasan } = await parseBody(req, batalkanSchema);
  const r = await batalkanAlokasi(user, id, alasan, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ alokasi: r.alokasi });
});
