import { NextResponse } from "next/server";
import { tandaiSemuaBaca } from "@/lib/notifikasi";
import { handle, requireSession } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const POST = handle(async () => {
  const user = await requireSession();
  return NextResponse.json({ jumlah: await tandaiSemuaBaca(user.id) });
});
