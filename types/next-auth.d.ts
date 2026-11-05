import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; nip: string; role: Role; authAt?: number } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    nip?: string;
    role?: Role;
    lastActivity?: number;
    /** Waktu login (ms); dibandingkan dengan User.sesiBerlakuSejak untuk mencabut sesi lama. */
    authAt?: number;
  }
}
