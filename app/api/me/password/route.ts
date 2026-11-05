import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { gantiPassword, gantiPasswordSchema } from "@/lib/password-change";
import { handle, requireSession } from "@/lib/rbac";
import { clientIp } from "@/lib/request";
import { pasangCookieSesi } from "@/lib/sesi-cookie";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request) => {
  const user = await requireSession({ allowMustChange: true });
  const parsed = gantiPasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { pesan: parsed.error.issues[0]?.message ?? "Permintaan tidak valid." },
      { status: 400 },
    );
  }
  const r = await gantiPassword(user.id, parsed.data.passwordLama, parsed.data.passwordBaru, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });

  // Sesi lain sudah dicabut (sesiBerlakuSejak); terbitkan ulang sesi perangkat ini agar tetap masuk.
  const res = NextResponse.json({ pesan: "Password berhasil diubah. Sesi di perangkat lain telah dikeluarkan." });
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, nip: true, nama: true, email: true, role: true } });
  await pasangCookieSesi(res, u, r.berlakuSejak.getTime());
  return res;
});
