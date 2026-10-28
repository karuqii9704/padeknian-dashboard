import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { authenticate } from "@/lib/auth-service";

export const { handlers, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {} },
      async authorize(creds) {
        const r = await authenticate(String(creds?.identifier ?? ""), String(creds?.password ?? ""), null);
        if (!r.ok) return null;
        return { id: r.user.id, name: r.user.nama, email: r.user.email, nip: r.user.nip, role: r.user.role };
      },
    }),
  ],
});
