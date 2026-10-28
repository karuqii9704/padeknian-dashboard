import { NextResponse } from "next/server";
import { ubahTim, ubahTimSchema, uuidSchema } from "@/lib/tim";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const actor = await requireRole("ADMIN");
  const id = parseParam((await ctx.params).id, uuidSchema, "Tim kerja tidak ditemukan.");
  const input = await parseBody(req, ubahTimSchema);
  const r = await ubahTim(actor.id, id, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ tim: r.tim });
});
