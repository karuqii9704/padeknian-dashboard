import { NextResponse } from "next/server";
import { auditLogQuery, daftarAuditLog } from "@/lib/audit-log";
import { handle, requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireRole("ADMIN");
  const parsed = auditLogQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ pesan: parsed.error.issues[0]?.message ?? "Parameter tidak valid." }, { status: 400 });
  }
  return NextResponse.json(await daftarAuditLog(parsed.data));
});
