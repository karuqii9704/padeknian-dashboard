import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { contohDocx, contohExe, contohJpg, contohPdf, contohPng } from "../lib/testing/mini-zip";
import { signedDownloadUrl } from "../lib/storage";
import { USERS } from "./support/data";
import { loginUI } from "./support/auth";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

async function sebagai(browser: Browser, nip: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginUI(page, nip);
  return { page, request: page.request, tutup: () => ctx.close() };
}
const unggah = (r: APIRequestContext, entriId: string, name: string, mimeType: string, buffer: Buffer) =>
  r.post(`/api/pekerjaan-harian/${entriId}/bukti`, { multipart: { file: { name, mimeType, buffer } } });
const ganti = (r: APIRequestContext, buktiId: string, name: string, mimeType: string, buffer: Buffer) =>
  r.put(`/api/bukti/${buktiId}`, { multipart: { file: { name, mimeType, buffer } } });

/** Apakah objek benar-benar ada di storage? (diuji lewat signed URL.) */
async function objekAda(request: APIRequestContext, key: string, contentType = "application/octet-stream") {
  const url = await signedDownloadUrl(key, { namaFile: "x", contentType, inline: false });
  return (await request.get(url)).status() === 200;
}

let entriId = "";
let periodeId = "";
let penugasanId = "";

test("setup: ketua membuat alokasi; Yul membuat entri", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const periode = ((await (await ketua.request.get("/api/periode")).json()).data as { id: string; status: string }[]).find((p) => p.status === "AKTIF")!;
  periodeId = periode.id;
  const tim = (await (await ketua.request.get("/api/tim")).json()).data[0] as { id: string };
  const anggota = (await (await ketua.request.get(`/api/tim/${tim.id}/anggota?periodeId=${periode.id}`)).json()).anggota as { userId: string; nama: string }[];
  const yulId = anggota.find((a) => a.nama === USERS.yul.nama)!.userId;
  const r = await ketua.request.post("/api/alokasi", {
    data: { timId: tim.id, periodeId, judul: "Uji hapus bukti", deskripsi: "uji", tanggalMulai: "2026-10-01", tanggalSelesai: "2026-10-30", targetVolume: 10, satuan: "dokumen", prioritas: "SEDANG", penugasan: [{ userId: yulId }] },
  });
  penugasanId = (await r.json()).alokasi.penugasan[0].id;
  await ketua.tutup();

  const yul = await sebagai(browser, USERS.yul.nip);
  const e = await yul.request.post("/api/pekerjaan-harian", { data: { penugasanId, tanggal: "2026-10-14", deskripsiCapaian: "Uji hapus bukti", volume: 1 } });
  entriId = (await e.json()).entri.id;
  await yul.tutup();
});

test("pemilik menghapus bukti: baris DB dan objek storage hilang (tanpa yatim)", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const id = (await (await unggah(yul.request, entriId, "hapus-saya.pdf", "application/pdf", contohPdf())).json()).bukti.id as string;
  const row = await prisma.buktiDukung.findUniqueOrThrow({ where: { id } });
  expect(await objekAda(yul.request, row.objectKey, "application/pdf")).toBe(true);

  const del = await yul.request.delete(`/api/bukti/${id}`);
  expect(del.status()).toBe(200);
  expect(await prisma.buktiDukung.findUnique({ where: { id } })).toBeNull();
  expect(await objekAda(yul.request, row.objectKey, "application/pdf"), "objek harus terhapus dari storage").toBe(false);
  expect((await yul.request.delete(`/api/bukti/${id}`)).status()).toBe(404);
  expect((await yul.request.get(`/api/bukti/${id}/download`, { maxRedirects: 0 })).status()).toBe(404);

  const audit = await prisma.auditLog.findFirst({ where: { aksi: "HAPUS_BUKTI", entitasId: id } });
  expect(audit).not.toBeNull();
  await yul.tutup();
});

test("ganti file: bukti baru dibuat dan lama dihapus dalam satu aksi; file tidak valid tidak mengubah apa pun", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const lama = (await (await unggah(yul.request, entriId, "versi-1.png", "image/png", contohPng())).json()).bukti;
  const rowLama = await prisma.buktiDukung.findUniqueOrThrow({ where: { id: lama.id } });

  // Pengganti tidak valid (.exe berkedok pdf) -> ditolak, bukti lama utuh.
  const buruk = await ganti(yul.request, lama.id, "baru.pdf", "application/pdf", contohExe());
  expect(buruk.status()).toBe(400);
  expect(await prisma.buktiDukung.findUnique({ where: { id: lama.id } })).not.toBeNull();
  expect(await objekAda(yul.request, rowLama.objectKey)).toBe(true);

  // Pengganti identik -> 409.
  expect((await ganti(yul.request, lama.id, "sama.png", "image/png", contohPng())).status()).toBe(409);

  const jumlahSebelum = await prisma.buktiDukung.count({ where: { pekerjaanHarianId: entriId } });
  const ok = await ganti(yul.request, lama.id, "versi-2.jpg", "image/jpeg", contohJpg());
  expect(ok.status()).toBe(200);
  const baru = (await ok.json()).bukti;
  expect(baru.id).not.toBe(lama.id);
  expect(baru.namaAsli).toBe("versi-2.jpg");
  expect(baru.mimeType).toBe("image/jpeg");
  expect(await prisma.buktiDukung.count({ where: { pekerjaanHarianId: entriId } }), "jumlah bukti tetap").toBe(jumlahSebelum);
  expect(await prisma.buktiDukung.findUnique({ where: { id: lama.id } })).toBeNull();
  expect(await objekAda(yul.request, rowLama.objectKey), "objek lama terhapus").toBe(false);
  const rowBaru = await prisma.buktiDukung.findUniqueOrThrow({ where: { id: baru.id } });
  expect(await objekAda(yul.request, rowBaru.objectKey, "image/jpeg")).toBe(true);
  expect(await prisma.auditLog.count({ where: { aksi: "GANTI_BUKTI", entitasId: baru.id } })).toBe(1);
  await yul.tutup();
});

test("penghapusan/penggantian ditolak: pegawai lain 403; DISETUJUI & periode DIKUNCI 409; revisi kembali MENUNGGU", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const b = (await (await unggah(yul.request, entriId, "dok.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", contohDocx())).json()).bukti.id as string;
  const baris = await prisma.buktiDukung.findUniqueOrThrow({ where: { id: b } });

  const rina = await sebagai(browser, USERS.rina.nip);
  expect((await rina.request.delete(`/api/bukti/${b}`)).status()).toBe(403);
  expect((await ganti(rina.request, b, "x.pdf", "application/pdf", contohPdf())).status()).toBe(403);
  await rina.tutup();

  await prisma.pekerjaanHarian.update({ where: { id: entriId }, data: { statusVerifikasi: "DISETUJUI" } });
  expect((await yul.request.delete(`/api/bukti/${b}`)).status()).toBe(409);
  expect((await ganti(yul.request, b, "x.pdf", "application/pdf", contohPdf())).status()).toBe(409);
  expect(await objekAda(yul.request, baris.objectKey)).toBe(true);

  await prisma.pekerjaanHarian.update({ where: { id: entriId }, data: { statusVerifikasi: "MENUNGGU" } });
  await prisma.periode.update({ where: { id: periodeId }, data: { status: "DIKUNCI" } });
  try {
    expect((await yul.request.delete(`/api/bukti/${b}`)).status()).toBe(409);
  } finally {
    await prisma.periode.update({ where: { id: periodeId }, data: { status: "AKTIF" } });
  }

  await prisma.pekerjaanHarian.update({ where: { id: entriId }, data: { statusVerifikasi: "MINTA_REVISI" } });
  expect((await yul.request.delete(`/api/bukti/${b}`)).status()).toBe(200);
  expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: entriId } })).statusVerifikasi).toBe("MENUNGGU");
  await yul.tutup();
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("form perbaikan: Hapus dengan konfirmasi dan Ganti file dalam satu alur", async ({ browser }) => {
    const yul = await sebagai(browser, USERS.yul.nip);
    const e = await yul.request.post("/api/pekerjaan-harian", { data: { penugasanId, tanggal: "2026-10-13", deskripsiCapaian: "Entri UI hapus ganti", volume: 1 } });
    const id = (await e.json()).entri.id as string;
    await unggah(yul.request, id, "foto-lama.png", "image/png", contohPng());
    await unggah(yul.request, id, "arsip.pdf", "application/pdf", contohPdf());

    const page = yul.page;
    await page.goto("/kalender", { waitUntil: "networkidle" });
    await page.locator('[data-tanggal="2026-10-13"]').click();
    await page.getByRole("listitem").filter({ hasText: "Entri UI hapus ganti" }).getByRole("button", { name: "Ubah" }).click();
    const form = page.getByRole("dialog");
    await expect(form.getByText("foto-lama.png")).toBeVisible();
    expect((await form.getByRole("button", { name: "Hapus bukti arsip.pdf" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Ganti file.
    await form.getByLabel("Ganti foto-lama.png").setInputFiles({ name: "foto-baru.jpg", mimeType: "image/jpeg", buffer: contohJpg() });
    await expect(form.getByText("foto-baru.jpg")).toBeVisible();
    await expect(form.getByText("foto-lama.png")).toHaveCount(0);

    // Hapus (konfirmasi).
    page.once("dialog", (d) => d.dismiss());
    await form.getByRole("button", { name: "Hapus bukti arsip.pdf" }).click();
    await expect(form.getByText("arsip.pdf")).toBeVisible(); // dibatalkan
    page.once("dialog", (d) => d.accept());
    await form.getByRole("button", { name: "Hapus bukti arsip.pdf" }).click();
    await expect(form.getByText("arsip.pdf")).toHaveCount(0);

    expect(await prisma.buktiDukung.count({ where: { pekerjaanHarianId: id } })).toBe(1);
    // Tutup form; daftar di kalender ikut diperbarui.
    await form.getByRole("button", { name: "Batal" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Entri UI hapus ganti" }).getByText("Ada bukti")).toBeVisible();
    await yul.tutup();
  });
});
