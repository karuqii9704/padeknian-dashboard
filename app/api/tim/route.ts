import { NextResponse } from "next/server";
import { buatTim, buatTimSchema, daftarTim } from "@/lib/tim";
import { handle, requireRole, requireSession } from "@/lib/rbac";
import { clientIp, parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireSession();
  return NextResponse.json({ data: await daftarTim() });
});

export const POST = handle(async (req: Request) => {
  const actor = await requireRole("ADMIN");
  const input = await parseBody(req, buatTimSchema);
  const r = await buatTim(actor.id, input, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ tim: r.tim }, { status: 201 });
});
