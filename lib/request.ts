import type { ZodType } from "zod";
import { HttpError } from "@/lib/rbac";

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip");
  return ip || null;
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
