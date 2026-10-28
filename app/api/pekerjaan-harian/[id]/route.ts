import { NextResponse } from "next/server";
import { detailEntri, hapusEntri, ubahEntri, ubahEntriSchema } from "@/lib/pekerjaan";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const idDari = async (ctx: Ctx) => parseParam((await ctx.params).id, uuidSchema, "Entri tidak ditemukan.");

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM", "PIMPINAN", "ADMIN");
  const r = await detailEntri(user, await idDari(ctx));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ entri: r.entri });
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const id = await idDari(ctx);
  const input = await parseBody(req, ubahEntriSchema);
  const r = await ubahEntri(user, id, input);
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ entri: r.entri });
});

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  await hapusEntri(user, await idDari(ctx), clientIp(req));
  return NextResponse.json({ pesan: "Entri dihapus." });
});
