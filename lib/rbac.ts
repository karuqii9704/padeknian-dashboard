import { cache } from "react";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type SessionUser = { id: string; nip: string; role: Role };

/** Murni (mudah diuji): apakah peran termasuk yang diizinkan. */
export function roleAllowed(role: Role, allowed: readonly Role[]) {
  return allowed.includes(role);
}

/** Pemilik data? Dipakai untuk aturan PEMILIK (pegawai hanya mengubah miliknya). */
export function isOwner(user: Pick<SessionUser, "id">, ownerId: string) {
  return user.id === ownerId;
}

/**
 * Baris pengguna sesi saat ini. Di-memo per permintaan (React `cache`) sehingga layout dan halaman
 * berbagi satu dekode token + satu query; di route handler `cache` tidak memo (tiap panggilan baru).
 */
export const penggunaSesi = cache(async () => {
  const session = await auth();
  if (!session?.user) return undefined; // tanpa sesi (berbeda dari null = akun tidak ditemukan)
  return db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, nip: true, nama: true, role: true, isActive: true, mustChangePassword: true },
  });
});

/** Sesi valid + akun masih aktif (cek DB, sehingga nonaktif langsung berlaku). */
export async function requireSession(opts: { allowMustChange?: boolean } = {}): Promise<SessionUser> {
  const u = await penggunaSesi();
  if (u === undefined) {
    throw new HttpError(401, "Sesi tidak valid atau sudah berakhir. Silakan login kembali.");
  }
  if (!u || !u.isActive) throw new HttpError(401, "Akun tidak aktif.");
  if (u.mustChangePassword && !opts.allowMustChange) {
    throw new HttpError(403, "Anda wajib mengganti password sementara terlebih dahulu.");
  }
  // Peran diambil dari DB, bukan dari token, agar perubahan peran langsung berlaku.
  return { id: u.id, nip: u.nip, role: u.role };
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireSession();
  if (!roleAllowed(user.role, roles)) {
    throw new HttpError(403, "Anda tidak memiliki izin untuk mengakses sumber daya ini.");
  }
  return user;
}

/** Wajib pemilik, kecuali peran di `bypassRoles`. */
export function requireOwner(user: SessionUser, ownerId: string, bypassRoles: Role[] = []) {
  if (isOwner(user, ownerId) || roleAllowed(user.role, bypassRoles)) return;
  throw new HttpError(403, "Anda hanya dapat mengakses data milik Anda sendiri.");
}

/** Bungkus handler agar HttpError menjadi respons JSON berbahasa Indonesia. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ pesan: e.message }, { status: e.status });
      throw e;
    }
  };
}
