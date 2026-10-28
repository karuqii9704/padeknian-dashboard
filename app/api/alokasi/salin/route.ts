import { NextResponse } from "next/server";
import { salinAlokasiSchema, salinDraft } from "@/lib/alokasi";
import { handle, requireRole } from "@/lib/rbac";
import { parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

// Mengembalikan DRAFT (tidak menyimpan). Penyimpanan dilakukan lewat POST /api/alokasi setelah ditinjau.
export const POST = handle(async (req: Request) => {
  const user = await requireRole("KETUA_TIM");
  const input = await parseBody(req, salinAlokasiSchema);
  const r = await salinDraft(user, input);
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ asal: r.asal, tujuan: r.tujuan, draft: r.draft });
});
