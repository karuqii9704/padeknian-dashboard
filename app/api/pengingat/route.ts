import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { kirimPengingatHarian } from "@/lib/pengingat";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

/** Token cron (header `Authorization: Bearer <CRON_SECRET>`); dibandingkan waktu-konstan. Nonaktif bila CRON_SECRET kosong. */
function tokenCronSah(req: Request) {
  const rahasia = process.env.CRON_SECRET;
  if (!rahasia || rahasia.length < 16) return false;
  const kiriman = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(kiriman);
  const b = Buffer.from(rahasia);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Kirim pengingat harian. Dipanggil penjadwal (cron) dengan token, atau Admin secara manual.
export const POST = handle(async (req: Request) => {
  const actorId = tokenCronSah(req) ? null : (await requireRole("ADMIN")).id;
  const hasil = await kirimPengingatHarian({ actorId, ip: clientIp(req) });
  return NextResponse.json(hasil);
});
