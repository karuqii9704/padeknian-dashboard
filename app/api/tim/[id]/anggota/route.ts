import { NextResponse } from "next/server";
import { aksesTim, daftarAnggota, ubahAnggota, ubahAnggotaSchema, uuidSchema } from "@/lib/tim";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("ADMIN", "KETUA_TIM", "PIMPINAN");
  const id = parseParam((await ctx.params).id, uuidSchema, "Tim kerja tidak ditemukan.");
  await aksesTim(user, id, { tulis: false });
  const periodeId = new URL(req.url).searchParams.get("periodeId") ?? undefined;
  if (periodeId) parseParam(periodeId, uuidSchema, "Periode tidak ditemukan.");
  const r = await daftarAnggota(id, periodeId);
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ periode: r.periode, anggota: r.anggota });
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("ADMIN", "KETUA_TIM");
  const id = parseParam((await ctx.params).id, uuidSchema, "Tim kerja tidak ditemukan.");
  const tim = await aksesTim(user, id, { tulis: true });
  const input = await parseBody(req, ubahAnggotaSchema);
  const r = await ubahAnggota(user.id, tim, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ pesan: "Keanggotaan tim diperbarui." });
});
