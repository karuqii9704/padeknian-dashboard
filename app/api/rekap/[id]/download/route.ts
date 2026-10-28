import { NextResponse } from "next/server";
import { z } from "zod";
import { tautanUnduhRekap } from "@/lib/rekap-unduh";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Mengarahkan ke signed URL berumur <= 15 menit. ?format=xlsx|pdf (default xlsx).
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("ADMIN", "PIMPINAN", "KETUA_TIM");
  const id = parseParam((await ctx.params).id, uuidSchema, "Rekap tidak ditemukan.");
  const f = z.enum(["xlsx", "pdf"]).safeParse(new URL(req.url).searchParams.get("format") ?? "xlsx");
  if (!f.success) return NextResponse.json({ pesan: "Format harus xlsx atau pdf." }, { status: 400 });
  const url = await tautanUnduhRekap(user, id, f.data);
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
});
