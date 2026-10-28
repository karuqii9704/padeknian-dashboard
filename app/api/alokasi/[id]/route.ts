import { NextResponse } from "next/server";
import { hapusAlokasi, ubahAlokasi, ubahAlokasiSchema } from "@/lib/alokasi";
import { uuidSchema } from "@/lib/tim";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("KETUA_TIM");
  const id = parseParam((await ctx.params).id, uuidSchema, "Alokasi tidak ditemukan.");
  const input = await parseBody(req, ubahAlokasiSchema);
  const r = await ubahAlokasi(user, id, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ alokasi: r.alokasi });
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("KETUA_TIM");
  const id = parseParam((await ctx.params).id, uuidSchema, "Alokasi tidak ditemukan.");
  const r = await hapusAlokasi(user, id, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ pesan: "Alokasi dihapus." });
});
