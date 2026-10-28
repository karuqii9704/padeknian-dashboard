import { NextResponse } from "next/server";
import { z } from "zod";
import { encode } from "next-auth/jwt";
import { authenticate } from "@/lib/auth-service";
import { clientIp } from "@/lib/request";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session-policy";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  identifier: z.string().min(1, "NIP atau email wajib diisi."),
  password: z.string().min(1, "Password wajib diisi."),
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

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ pesan: "Konfigurasi server belum lengkap." }, { status: 500 });
  }

  const { user } = result;
  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      nip: user.nip,
      name: user.nama,
      email: user.email,
      role: user.role,
      lastActivity: Date.now(),
    },
    secret,
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const res = NextResponse.json({
    user: { id: user.id, nip: user.nip, nama: user.nama, role: user.role },
    mustChangePassword: user.mustChangePassword,
  });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
