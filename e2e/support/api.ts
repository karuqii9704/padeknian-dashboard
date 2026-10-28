import { expect, type APIRequestContext, type Browser } from "@playwright/test";
import { loginUI } from "./auth";

/** Konteks browser terpisah yang sudah login sebagai pengguna tertentu. */
export async function sebagai(browser: Browser, nip: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginUI(page, nip);
  return { page, request: page.request, tutup: () => ctx.close() };
}

export async function periodeAktif(request: APIRequestContext) {
  const data = (await (await request.get("/api/periode")).json()).data as { id: string; status: string }[];
  return data.find((p) => p.status === "AKTIF")!;
}

/** ID anggota tim pada periode: kembalikan fungsi nama -> userId. */
export async function anggotaTim(request: APIRequestContext, timId: string, periodeId: string) {
  const a = (await (await request.get(`/api/tim/${timId}/anggota?periodeId=${periodeId}`)).json()).anggota as { userId: string; nama: string }[];
  return (nama: string) => a.find((x) => x.nama === nama)!.userId;
}

export async function timMilik(request: APIRequestContext) {
  const me = await (await request.get("/api/me")).json();
  const tims = (await (await request.get("/api/tim")).json()).data as { id: string; ketua: { id: string } }[];
  return tims.find((t) => t.ketua.id === me.user.id)!;
}

export async function buatAlokasi(request: APIRequestContext, o: { timId: string; periodeId: string; judul: string; userIds: string[]; target?: number }) {
  const r = await request.post("/api/alokasi", {
    data: {
      timId: o.timId,
      periodeId: o.periodeId,
      judul: o.judul,
      deskripsi: "uji",
      tanggalMulai: "2026-10-01",
      tanggalSelesai: "2026-10-30",
      targetVolume: o.target ?? 100,
      satuan: "dokumen",
      prioritas: "SEDANG",
      penugasan: o.userIds.map((userId) => ({ userId })),
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).alokasi as { id: string; penugasan: { id: string; userId: string }[] };
}

export async function catat(request: APIRequestContext, penugasanId: string, deskripsi: string, volume = 3, tanggal = "2026-10-14") {
  const r = await request.post("/api/pekerjaan-harian", { data: { penugasanId, tanggal, deskripsiCapaian: deskripsi, volume } });
  expect(r.status()).toBe(201);
  return (await r.json()).entri.id as string;
}
