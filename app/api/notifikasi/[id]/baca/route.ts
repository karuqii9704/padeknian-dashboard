import { NextResponse } from "next/server";
import { tandaiBaca } from "@/lib/notifikasi";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireSession } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Hanya pemilik notifikasi yang dapat menandai dibaca; selain itu 404 (tidak membocorkan keberadaan).
export const POST = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireSession();
  const id = parseParam((await ctx.params).id, uuidSchema, "Notifikasi tidak ditemukan.");
  if (!(await tandaiBaca(user.id, id))) return NextResponse.json({ pesan: "Notifikasi tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ pesan: "Notifikasi ditandai sudah dibaca." });
});
