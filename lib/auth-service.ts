import type { Role, User } from "@prisma/client";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { LOGIN_WINDOW_MS, lockoutRemainingMs } from "@/lib/session-policy";

export type AuthResult =
  | { ok: true; user: Pick<User, "id" | "nip" | "nama" | "email" | "role" | "mustChangePassword"> }
  | { ok: false; status: 400 | 401 | 429; pesan: string; retryAfterSeconds?: number };

// Hash bcrypt cost 12 dummy agar waktu respons tidak membedakan user ada/tidak.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("dummy-password-tidak-dipakai"));

export async function authenticate(
  identifierRaw: string,
  password: string,
  ip: string | null,
): Promise<AuthResult> {
  const identifier = identifierRaw.trim().toLowerCase();
  if (!identifier || !password) {
    return { ok: false, status: 400, pesan: "NIP/email dan password wajib diisi." };
  }

  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const failures = await db.loginAttempt.findMany({
    where: { identifier, createdAt: { gte: since } },
    select: { createdAt: true },
  });
  const remaining = lockoutRemainingMs(
    failures.map((f) => f.createdAt.getTime()),
    Date.now(),
  );
  if (remaining > 0) {
    const menit = Math.ceil(remaining / 60000);
    return {
      ok: false,
      status: 429,
      pesan: `Terlalu banyak percobaan login gagal. Coba lagi dalam ${menit} menit.`,
      retryAfterSeconds: Math.ceil(remaining / 1000),
    };
  }

  const user = await db.user.findFirst({
    where: { OR: [{ nip: identifierRaw.trim() }, { email: identifier }] },
  });
  const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user || !user.isActive || !valid) {
    await db.loginAttempt.create({ data: { identifier } });
    await tulisAudit({
      userId: user?.id ?? null,
      aksi: "LOGIN_GAGAL",
      entitas: "User",
      entitasId: user?.id ?? null,
      metadata: { alasan: !user ? "tidak_ditemukan" : !user.isActive ? "nonaktif" : "password_salah" },
      ipAddress: ip,
    });
    return { ok: false, status: 401, pesan: "NIP/email atau password salah." };
  }

  await db.loginAttempt.deleteMany({ where: { identifier } });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await tulisAudit({
    userId: user.id,
    aksi: "LOGIN",
    entitas: "User",
    entitasId: user.id,
    ipAddress: ip,
  });

  return {
    ok: true,
    user: { id: user.id, nip: user.nip, nama: user.nama, email: user.email, role: user.role as Role, mustChangePassword: user.mustChangePassword },
  };
}
