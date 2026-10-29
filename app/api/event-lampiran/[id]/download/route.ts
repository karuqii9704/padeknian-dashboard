import { NextResponse } from "next/server";
import { tautanUnduhLampiran } from "@/lib/event-lampiran";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Otorisasi diperiksa di server, lalu diarahkan ke signed URL berumur <= 15 menit. Tidak ada URL publik permanen.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const id = parseParam((await ctx.params).id, uuidSchema, "Lampiran tidak ditemukan.");
  const unduh = new URL(req.url).searchParams.get("unduh") === "1";
  const url = await tautanUnduhLampiran(user, id, { unduh });
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
});
