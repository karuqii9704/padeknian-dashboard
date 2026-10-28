import { NextResponse } from "next/server";
import { handle, requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Endpoint dummy untuk uji regresi RBAC: hanya ADMIN dan PIMPINAN.
export const GET = handle(async () => {
  const user = await requireRole("ADMIN", "PIMPINAN");
  return NextResponse.json({ ok: true, role: user.role });
});
