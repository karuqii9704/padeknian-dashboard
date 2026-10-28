import { NextResponse } from "next/server";
import { buatKegiatan, buatKegiatanSchema, daftarKegiatan, listKegiatanQuery } from "@/lib/kegiatan";
import { handle, requireRole, requireSession } from "@/lib/rbac";
import { clientIp, parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireSession();
  const parsed = listKegiatanQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  return NextResponse.json({ data: await daftarKegiatan(parsed.data) });
});

export const POST = handle(async (req: Request) => {
  const actor = await requireRole("ADMIN");
  const input = await parseBody(req, buatKegiatanSchema);
  const r = await buatKegiatan(actor.id, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ kegiatan: r.kegiatan }, { status: 201 });
});
