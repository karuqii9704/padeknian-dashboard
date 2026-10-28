import { NextResponse } from "next/server";
import { buatEntri, buatEntriSchema, daftarEntri, listEntriQuery } from "@/lib/pekerjaan";
import { handle, requireRole } from "@/lib/rbac";
import { parseBody } from "@/lib/request";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM", "PIMPINAN", "ADMIN");
  const parsed = listEntriQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ pesan: "Parameter tidak valid." }, { status: 400 });
  return NextResponse.json(await daftarEntri(user, parsed.data));
});

// Ketua tim juga mengerjakan alokasi (sebagai penerima), jadi boleh mencatat entri sendiri.
export const POST = handle(async (req: Request) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const input = await parseBody(req, buatEntriSchema);
  const r = await buatEntri(user, input);
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ entri: r.entri }, { status: 201 });
});
