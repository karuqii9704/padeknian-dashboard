import { z } from "zod";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/password";

export const HISTORY_CHECK_COUNT = 3;

export const passwordBaruSchema = z
  .string()
  .min(8, "Password minimal 8 karakter.")
  .max(72, "Password maksimal 72 karakter.");

export const gantiPasswordSchema = z.object({
  passwordLama: z.string().min(1, "Password lama wajib diisi."),
  passwordBaru: passwordBaruSchema,
});

export type GantiPasswordResult = { ok: true } | { ok: false; status: 400 | 401; pesan: string };

export async function gantiPassword(
  userId: string,
  passwordLama: string,
  passwordBaru: string,
  ip: string | null,
): Promise<GantiPasswordResult> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, status: 401, pesan: "Akun tidak ditemukan." };

  if (!(await verifyPassword(passwordLama, user.passwordHash))) {
    return { ok: false, status: 400, pesan: "Password lama salah." };
  }

  // Bandingkan dengan password saat ini + 3 password sebelumnya.
  const history = await db.userPasswordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_CHECK_COUNT,
    select: { passwordHash: true },
  });
  for (const h of [{ passwordHash: user.passwordHash }, ...history]) {
    if (await verifyPassword(passwordBaru, h.passwordHash)) {
      return {
        ok: false,
        status: 400,
        pesan: `Password baru tidak boleh sama dengan ${HISTORY_CHECK_COUNT} password terakhir Anda.`,
      };
    }
  }

  const newHash = await hashPassword(passwordBaru);
  await db.$transaction([
    db.userPasswordHistory.create({ data: { userId, passwordHash: user.passwordHash } }),
    db.user.update({ where: { id: userId }, data: { passwordHash: newHash, mustChangePassword: false } }),
  ]);
  await tulisAudit({
    userId,
    aksi: "GANTI_PASSWORD",
    entitas: "User",
    entitasId: userId,
    ipAddress: ip,
  });
  return { ok: true };
}
