import type { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, SESSION_MAX_AGE_SECONDS } from "@/lib/session-policy";

/**
 * Terbitkan cookie sesi (JWT terenkripsi Auth.js) pada respons. Dipakai login dan ganti password
 * (agar perangkat yang mengganti password tetap masuk, sementara sesi lain dicabut).
 * Mengembalikan false bila NEXTAUTH_SECRET belum diatur.
 */
export async function pasangCookieSesi(
  res: NextResponse,
  user: { id: string; nip: string; nama: string; email: string | null; role: Role },
  authAt: number = Date.now(),
) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return false;
  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      nip: user.nip,
      name: user.nama,
      email: user.email,
      role: user.role,
      lastActivity: Date.now(),
      authAt,
    },
    secret,
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  res.cookies.set(SESSION_COOKIE_NAME, token, { ...SESSION_COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_SECONDS });
  return true;
}
