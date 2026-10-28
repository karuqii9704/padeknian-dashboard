import { NextResponse } from "next/server";
import { ringkasanQuery, ringkasanVerifikasi } from "@/lib/ringkasan-verifikasi";
import { handle, requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Pimpinan: status verifikasi agregat per pegawai, hanya baca (FR-36). Aksi verifikasi tetap hanya untuk Ketua Tim.
export const GET = handle(async (req: Request) => {
  await requireRole("PIMPINAN", "ADMIN");
  const parsed = ringkasanQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  const r = await ringkasanVerifikasi(parsed.data);
  if (!r) return NextResponse.json({ pesan: "Belum ada periode aktif." }, { status: 404 });
  return NextResponse.json(r);
});
