import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bolehLihat } from "@/lib/pekerjaan";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Riwayat verifikasi bersifat append-only (FR-35): hanya GET yang diekspor. Metode lain (PATCH, PUT, DELETE)
// otomatis dijawab 405 oleh Next.js, dan trigger database menolak UPDATE/DELETE pada tabel ini.
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM", "PIMPINAN", "ADMIN");
  const id = parseParam((await ctx.params).id, uuidSchema, "Verifikasi tidak ditemukan.");
  const v = await db.verifikasi.findUnique({
    where: { id },
    include: { verifikator: { select: { id: true, nama: true } }, pekerjaanHarian: { select: { userId: true, periodeId: true } } },
  });
  if (!v || !(await bolehLihat(user, v.pekerjaanHarian))) {
    return NextResponse.json({ pesan: "Verifikasi tidak ditemukan." }, { status: 404 });
  }
  return NextResponse.json({
    verifikasi: { id: v.id, pekerjaanHarianId: v.pekerjaanHarianId, aksi: v.aksi, catatan: v.catatan, verifikator: v.verifikator, createdAt: v.createdAt.toISOString() },
  });
});
