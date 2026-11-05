import { NextResponse } from "next/server";
import { eksporDashboard } from "@/lib/dashboard-ekspor";
import { pegawaiQuery } from "@/lib/dashboard-pegawai";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

// Snapshot tabel dashboard ke XLSX sesuai filter. Mengembalikan signed URL berumur <= 15 menit (bukan URL publik permanen).
export const GET = handle(async (req: Request) => {
  const user = await requireRole("KETUA_TIM", "PIMPINAN", "ADMIN");
  const parsed = pegawaiQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  const r = await eksporDashboard(user, parsed.data, clientIp(req));
  if (!r) return NextResponse.json({ pesan: "Belum ada periode aktif." }, { status: 404 });
  return NextResponse.json(r);
});
