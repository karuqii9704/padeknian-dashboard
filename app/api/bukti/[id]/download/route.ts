import { NextResponse } from "next/server";
import { tautanUnduh } from "@/lib/bukti";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Otorisasi diperiksa di server, lalu diarahkan ke signed URL berumur <= 15 menit. Tidak ada URL publik permanen.
export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM", "PIMPINAN", "ADMIN");
  const id = parseParam((await ctx.params).id, uuidSchema, "Bukti tidak ditemukan.");
  const unduh = new URL(req.url).searchParams.get("unduh") === "1";
  const url = await tautanUnduh(user, id, { unduh });
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
});
