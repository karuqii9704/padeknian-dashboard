import { NextResponse } from "next/server";
import { buatAlokasi, buatAlokasiSchema, daftarAlokasi, listAlokasiQuery } from "@/lib/alokasi";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM", "PIMPINAN", "ADMIN");
  const parsed = listAlokasiQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  return NextResponse.json(await daftarAlokasi(user, parsed.data));
});

export const POST = handle(async (req: Request) => {
  const user = await requireRole("KETUA_TIM");
  const input = await parseBody(req, buatAlokasiSchema);
  const r = await buatAlokasi(user, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ alokasi: r.alokasi }, { status: 201 });
});
