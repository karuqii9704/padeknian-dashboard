import { NextResponse } from "next/server";
import { gantiBukti, hapusBukti } from "@/lib/bukti";
import { MAKS_UKURAN_BYTES } from "@/lib/bukti-batas";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { clientIp, parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const idDari = async (ctx: Ctx) => parseParam((await ctx.params).id, uuidSchema, "Bukti tidak ditemukan.");

export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  await hapusBukti(user, await idDari(ctx), clientIp(req));
  return NextResponse.json({ pesan: "Bukti dihapus." });
});

// Ganti file: multipart dengan field "file". Bukti baru dibuat dan yang lama dihapus dalam satu aksi.
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const id = await idDari(ctx);
  if (Number(req.headers.get("content-length") ?? 0) > MAKS_UKURAN_BYTES + 1024 * 1024) {
    return NextResponse.json({ pesan: "Ukuran file melebihi batas 10 MB." }, { status: 413 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ pesan: "File pengganti wajib dipilih." }, { status: 400 });
  const r = await gantiBukti(user, id, { nama: file.name, tipe: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }, clientIp(req));
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ bukti: r.bukti });
});
