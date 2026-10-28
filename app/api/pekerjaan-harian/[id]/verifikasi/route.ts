import { NextResponse } from "next/server";
import { verifikasiEntri, verifikasiSchema } from "@/lib/verifikasi-aksi";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("KETUA_TIM");
  const id = parseParam((await ctx.params).id, uuidSchema, "Catatan tidak ditemukan.");
  const input = await parseBody(req, verifikasiSchema);
  const r = await verifikasiEntri(user, id, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({
    verifikasi: { id: r.verifikasi.id, aksi: r.verifikasi.aksi, catatan: r.verifikasi.catatan, createdAt: r.verifikasi.createdAt.toISOString() },
    statusVerifikasi: r.statusBaru,
  });
});
