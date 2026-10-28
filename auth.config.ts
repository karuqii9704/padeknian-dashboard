import type { NextAuthConfig } from "next-auth";
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE_SECONDS,
  isIdleExpired,
} from "@/lib/session-policy";

// Konfigurasi edge-safe (tanpa Prisma/bcrypt) agar bisa dipakai di middleware.
export const authConfig = {
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  cookies: {
    sessionToken: { name: SESSION_COOKIE_NAME, options: SESSION_COOKIE_OPTIONS },
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      const now = Date.now();
      if (user) {
        token.id = user.id;
        token.nip = (user as { nip: string }).nip;
        token.role = (user as { role: NonNullable<typeof token.role> }).role;
      } else if (isIdleExpired(token.lastActivity, now)) {
        return null; // idle > 60 menit: sesi dibatalkan
      }
      token.lastActivity = now;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.nip = token.nip as string;
      session.user.role = token.role as NonNullable<typeof token.role>;
      return session;
    },
  },
} satisfies NextAuthConfig;
