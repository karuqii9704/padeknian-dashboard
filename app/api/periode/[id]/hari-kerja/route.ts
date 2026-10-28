import { NextResponse } from "next/server";
import { daftarHariKerja } from "@/lib/periode";
import { uuidSchema } from "@/lib/tim";
import { handle, requireSession } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireSession();
  const id = parseParam((await ctx.params).id, uuidSchema, "Periode tidak ditemukan.");
  const r = await daftarHariKerja(id);
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ periodeId: r.periodeId, jumlah: r.jumlah, tanggal: r.tanggal });
});
