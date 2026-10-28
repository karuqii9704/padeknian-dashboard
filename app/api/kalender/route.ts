import { NextResponse } from "next/server";
import { kalenderSaya } from "@/lib/hari-ini";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const periodeId = new URL(req.url).searchParams.get("periodeId") ?? undefined;
  if (periodeId && !uuidSchema.safeParse(periodeId).success) {
    return NextResponse.json({ pesan: "Periode tidak ditemukan." }, { status: 404 });
  }
  const data = await kalenderSaya(user, periodeId);
  if (!data) return NextResponse.json({ pesan: "Belum ada periode." }, { status: 404 });
  return NextResponse.json(data);
});
