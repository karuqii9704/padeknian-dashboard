import type { ZodType } from "zod";
import { HttpError } from "@/lib/rbac";

/**
 * IP klien menurut proxy tepercaya. Entri X-Forwarded-For paling kiri dapat diisi bebas oleh klien,
 * jadi diambil entri ke-`TRUSTED_PROXY_HOPS` dari kanan (bawaan 1 = ditambahkan proxy terdekat).
 * Dipakai untuk audit dan pembatasan login.
 */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const daftar = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    const hop = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);
    const ip = daftar[Math.max(0, daftar.length - hop)];
    if (ip) return ip.slice(0, 64);
  }
  return req.headers.get("x-real-ip")?.trim().slice(0, 64) || null;
}

/** Baca body JSON + validasi Zod; gagal -> HttpError 400 berpesan Indonesia. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Permintaan tidak valid.");
  return parsed.data;
}

export function parseParam(value: string, schema: ZodType<string>, notFound = "Data tidak ditemukan.") {
  if (!schema.safeParse(value).success) throw new HttpError(404, notFound);
  return value;
}
