import { NextResponse } from "next/server";
import { riwayatVersiRekap } from "@/lib/rekap";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

// [id] = periodeId. ?userId= pegawai yang riwayat versinya diminta.
type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("ADMIN", "PIMPINAN", "KETUA_TIM");
  const periodeId = parseParam((await ctx.params).id, uuidSchema, "Periode tidak ditemukan.");
  const userId = parseParam(new URL(req.url).searchParams.get("userId") ?? "", uuidSchema, "Pegawai tidak ditemukan.");
  return NextResponse.json(await riwayatVersiRekap(user, periodeId, userId));
});
