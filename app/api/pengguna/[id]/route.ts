import { NextResponse } from "next/server";
import { z } from "zod";
import { ubahPengguna, ubahPenggunaSchema } from "@/lib/users";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const actor = await requireRole("ADMIN");
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ pesan: "Pengguna tidak ditemukan." }, { status: 404 });
  }
  const parsed = ubahPenggunaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ pesan: parsed.error.issues[0]?.message ?? "Permintaan tidak valid." }, { status: 400 });
  }
  const r = await ubahPengguna(actor.id, id, parsed.data, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ user: r.user });
});
