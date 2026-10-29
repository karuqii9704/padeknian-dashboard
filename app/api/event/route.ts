import { NextResponse } from "next/server";
import { buatEvent, daftarEvent } from "@/lib/event";
import { buatEventSchema, listEventQuery } from "@/lib/event-schema";
import { handle, requireRole } from "@/lib/rbac";
import { parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

// Event hanya untuk pegawai dan ketua tim (pelapor); ketua tim juga membaca event anggota lewat ?cakupan=tim.
export const GET = handle(async (req: Request) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const parsed = listEventQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  return NextResponse.json(await daftarEvent(user, parsed.data));
});

export const POST = handle(async (req: Request) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const input = await parseBody(req, buatEventSchema);
  const r = await buatEvent(user, input);
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ event: r.event }, { status: 201 });
});
