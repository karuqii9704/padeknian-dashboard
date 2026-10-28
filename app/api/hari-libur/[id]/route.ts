import { NextResponse } from "next/server";
import { hapusHariLibur } from "@/lib/periode";
import { uuidSchema } from "@/lib/tim";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const actor = await requireRole("ADMIN");
  const id = parseParam((await ctx.params).id, uuidSchema, "Hari libur tidak ditemukan.");
  const r = await hapusHariLibur(actor.id, id, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ pesan: "Hari libur dihapus." });
});
