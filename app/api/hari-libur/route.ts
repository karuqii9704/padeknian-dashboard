import { NextResponse } from "next/server";
import { buatHariLiburSchema, daftarHariLibur, tambahHariLibur } from "@/lib/periode";
import { handle, requireRole, requireSession } from "@/lib/rbac";
import { clientIp, parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireSession();
  const t = new URL(req.url).searchParams.get("tahun");
  const tahun = t && /^\d{4}$/.test(t) ? Number(t) : undefined;
  return NextResponse.json({ data: await daftarHariLibur(tahun) });
});

export const POST = handle(async (req: Request) => {
  const actor = await requireRole("ADMIN");
  const input = await parseBody(req, buatHariLiburSchema);
  const r = await tambahHariLibur(actor.id, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ libur: r.libur }, { status: 201 });
});
