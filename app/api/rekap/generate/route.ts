import { NextResponse } from "next/server";
import { generateSchema, mulaiGenerate } from "@/lib/rekap";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

// Memulai pembuatan rekap secara asinkron (202). Pantau status lewat GET /api/rekap/:periodeId.
export const POST = handle(async (req: Request) => {
  const user = await requireRole("ADMIN", "PIMPINAN");
  const input = await parseBody(req, generateSchema);
  const r = await mulaiGenerate(user, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ jumlah: r.jumlah, rekap: r.rekap }, { status: 202 });
});
