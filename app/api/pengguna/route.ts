import { NextResponse } from "next/server";
import { buatPengguna, buatPenggunaSchema, daftarPengguna, listQuerySchema } from "@/lib/users";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireRole("ADMIN");
  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  }
  return NextResponse.json(await daftarPengguna(parsed.data));
});

export const POST = handle(async (req: Request) => {
  const actor = await requireRole("ADMIN");
  const parsed = buatPenggunaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ pesan: parsed.error.issues[0]?.message ?? "Permintaan tidak valid." }, { status: 400 });
  }
  const r = await buatPengguna(actor.id, parsed.data, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ user: r.user, passwordSementara: r.passwordSementara }, { status: 201 });
});
