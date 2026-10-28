import { NextResponse } from "next/server";
import { buatZipBukti } from "@/lib/bukti-zip";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// [id] = periodeId (segmen harus bernama sama dengan route rekap lain). ?userId= pegawai yang buktinya diunduh.
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("ADMIN", "PIMPINAN");
  const periodeId = parseParam((await ctx.params).id, uuidSchema, "Periode tidak ditemukan.");
  const userId = parseParam(new URL(req.url).searchParams.get("userId") ?? "", uuidSchema, "Pegawai tidak ditemukan.");
  const url = await buatZipBukti(user, periodeId, userId, clientIp(req));
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
});
