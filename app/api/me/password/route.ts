import { NextResponse } from "next/server";
import { gantiPassword, gantiPasswordSchema } from "@/lib/password-change";
import { handle, requireSession } from "@/lib/rbac";
import { clientIp } from "@/lib/request";

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
  return NextResponse.json({ pesan: "Password berhasil diubah." });
});
