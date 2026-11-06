import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, requireSession } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  // requireSession: akun aktif dan sesi belum dicabut (ganti/reset password).
  const me = await requireSession({ allowMustChange: true });
  const user = await db.user.findUniqueOrThrow({
    where: { id: me.id },
    select: { id: true, nip: true, nama: true, email: true, role: true, jabatan: true, mustChangePassword: true },
  });
  // Tim diisi setelah model TimKerja/AnggotaTim ada (t6-t7).
  return NextResponse.json({ user, tim: [] });
});
