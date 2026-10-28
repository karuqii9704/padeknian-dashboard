import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buatPeriode, buatPeriodeSchema } from "@/lib/periode";
import { handle, requireRole, requireSession } from "@/lib/rbac";
import { clientIp, parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireSession();
  const data = await db.periode.findMany({ orderBy: [{ tahun: "desc" }, { bulan: "desc" }] });
  return NextResponse.json({ data });
});

export const POST = handle(async (req: Request) => {
  const actor = await requireRole("ADMIN");
  const input = await parseBody(req, buatPeriodeSchema);
  const r = await buatPeriode(actor.id, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ periode: r.periode }, { status: 201 });
});
