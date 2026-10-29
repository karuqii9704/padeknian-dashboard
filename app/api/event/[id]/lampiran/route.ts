import { NextResponse } from "next/server";
import { MAKS_UKURAN_BYTES } from "@/lib/bukti-file";
import { unggahLampiran } from "@/lib/event-lampiran";
import { uuidSchema } from "@/lib/schemas";
import { handle, requireRole } from "@/lib/rbac";
import { parseParam } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Satu file per permintaan (multipart, field "file"). Klien mengunggah berkas satu per satu agar progres per file jelas.
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const user = await requireRole("PEGAWAI", "KETUA_TIM");
  const id = parseParam((await ctx.params).id, uuidSchema, "Event tidak ditemukan.");

  // Tolak lebih awal sebelum badan permintaan dibaca penuh.
  const panjang = Number(req.headers.get("content-length") ?? 0);
  if (panjang > MAKS_UKURAN_BYTES + 1024 * 1024) {
    return NextResponse.json({ pesan: "Ukuran file melebihi batas 10 MB." }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ pesan: "File lampiran wajib dipilih." }, { status: 400 });
  }

  const r = await unggahLampiran(user, id, { nama: file.name, tipe: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
  if (!r.ok) return NextResponse.json({ pesan: r.pesan }, { status: r.status });
  return NextResponse.json({ lampiran: r.lampiran }, { status: 201 });
});
