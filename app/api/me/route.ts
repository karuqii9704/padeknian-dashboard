import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ pesan: "Sesi tidak valid atau sudah berakhir. Silakan login kembali." }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, nip: true, nama: true, email: true, role: true, jabatan: true, isActive: true, mustChangePassword: true },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ pesan: "Akun tidak aktif." }, { status: 401 });
  }

  // Tim diisi setelah model TimKerja/AnggotaTim ada (t6-t7).
  return NextResponse.json({ user: { ...user, isActive: undefined }, tim: [] });
}
