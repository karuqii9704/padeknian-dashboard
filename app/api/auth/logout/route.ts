import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { tulisAudit } from "@/lib/audit";
import { clientIp } from "@/lib/request";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from "@/lib/session-policy";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user) {
    await tulisAudit({
      userId: session.user.id,
      aksi: "LOGOUT",
      entitas: "User",
      entitasId: session.user.id,
      ipAddress: clientIp(req),
    });
  }
  const res = NextResponse.json({ pesan: "Berhasil keluar." });
  res.cookies.set(SESSION_COOKIE_NAME, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
