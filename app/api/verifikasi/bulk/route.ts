import { NextResponse } from "next/server";
import { bulkSchema, bulkSetujui } from "@/lib/verifikasi-bulk";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

// Bulk approve (FR-33): semua-atau-tidak-sama-sekali dalam satu transaksi.
export const POST = handle(async (req: Request) => {
  const user = await requireRole("KETUA_TIM");
  const { ids } = await parseBody(req, bulkSchema);
  const r = await bulkSetujui(user, ids, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan, masalah: r.masalah }, { status: r.status });
  return NextResponse.json({ jumlah: r.jumlah, hasil: r.hasil });
});
