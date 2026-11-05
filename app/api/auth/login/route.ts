import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/auth-service";
import { clientIp } from "@/lib/request";
import { pasangCookieSesi } from "@/lib/sesi-cookie";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  identifier: z.string().min(1, "NIP atau email wajib diisi.").max(254, "NIP/email terlalu panjang."),
  password: z.string().min(1, "Password wajib diisi.").max(256, "Password terlalu panjang."),
});

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { pesan: parsed.error.issues[0]?.message ?? "Permintaan tidak valid." },
      { status: 400 },
    );
  }

  const result = await authenticate(parsed.data.identifier, parsed.data.password, clientIp(req));
  if (!result.ok) {
    const res = NextResponse.json({ pesan: result.pesan }, { status: result.status });
    if (result.retryAfterSeconds) res.headers.set("Retry-After", String(result.retryAfterSeconds));
    return res;
  }

  const { user } = result;
  const res = NextResponse.json({
    user: { id: user.id, nip: user.nip, nama: user.nama, role: user.role },
    mustChangePassword: user.mustChangePassword,
  });
  if (!(await pasangCookieSesi(res, user))) {
    return NextResponse.json({ pesan: "Konfigurasi server belum lengkap." }, { status: 500 });
  }
  return res;
}
