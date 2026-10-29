import { NextResponse } from "next/server";
import { detailEvent, hapusEvent, ubahEvent } from "@/lib/event";
import { ubahEventSchema } from "@/lib/event-schema";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const idDari = async (ctx: Ctx) => parseParam((await ctx.params).id, uuidSchema, "Event tidak ditemukan.");

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const r = await detailEvent(user, await idDari(ctx));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ event: r.event });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const id = await idDari(ctx);
  const input = await parseBody(req, ubahEventSchema);
  const r = await ubahEvent(user, id, input);
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ event: r.event });
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  await hapusEvent(user, await idDari(ctx), clientIp(req));
  return NextResponse.json({ pesan: "Event dihapus." });
});
