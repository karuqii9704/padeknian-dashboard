import { NextResponse } from "next/server";
import { hapusLampiran } from "@/lib/event-lampiran";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const id = parseParam((await ctx.params).id, uuidSchema, "Lampiran tidak ditemukan.");
  await hapusLampiran(user, id, clientIp(req));
  return NextResponse.json({ pesan: "Lampiran dihapus." });
});
