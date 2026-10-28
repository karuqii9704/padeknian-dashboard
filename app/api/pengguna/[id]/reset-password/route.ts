import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/lib/users";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const actor = await requireRole("ADMIN");
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ pesan: "Pengguna tidak ditemukan." }, { status: 404 });
  }
  const r = await resetPassword(actor.id, id, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ passwordSementara: r.passwordSementara });
});
