import { NextResponse } from "next/server";
import { daftarNotifikasi, listNotifQuery } from "@/lib/notifikasi";
import { handle, requireSession } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const user = await requireSession();
  const parsed = listNotifQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  return NextResponse.json(await daftarNotifikasi(user.id, parsed.data));
});
