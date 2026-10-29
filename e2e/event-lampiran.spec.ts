import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { contohExe, contohPdf, contohPng } from "../lib/testing/mini-zip";
import { USERS } from "./support/data";
import { sebagai } from "./support/api";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

const unggah = (request: APIRequestContext, eventId: string, name: string, mimeType: string, buffer: Buffer) =>
  request.post(`/api/event/${eventId}/lampiran`, { multipart: { file: { name, mimeType, buffer } } });
const unik = (s: string) => Buffer.concat([contohPdf(), Buffer.from(s)]);

const badan = (judul: string) => ({
  judul,
  jenis: "PELATIHAN",
  tanggalMulai: "2026-10-12",
  tanggalSelesai: "2026-10-13",
  lokasi: "Aula BPS Kerinci",
  peran: "Peserta",
  uraianHasil: "Materi pelatihan dipraktikkan.",
});

let eventId = "";
let lampiranId = "";

test("setup: Tari membuat event", async ({ browser }) => {
  const tari = await sebagai(browser, USERS.tari.nip);
  const r = await tari.request.post("/api/event", { data: badan("Pelatihan lampiran Tari") });
  expect(r.status()).toBe(201);
  eventId = (await r.json()).event.id;
  await tari.tutup();
});

test("lampiran valid: PNG diterima, tautan tanpa object key, muncul di detail event", async ({ browser }) => {
  const tari = await sebagai(browser, USERS.tari.nip);
  const r = await unggah(tari.request, eventId, "foto kegiatan.png", "image/png", contohPng());
  expect(r.status()).toBe(201);
  const l = (await r.json()).lampiran as { id: string; namaAsli: string; mimeType: string; tautan: string };
  lampiranId = l.id;
  expect(l).toMatchObject({ namaAsli: "foto kegiatan.png", mimeType: "image/png" });
  expect(l.tautan).toBe(`/api/event-lampiran/${l.id}/download`);
  expect(JSON.stringify(l)).not.toContain("objectKey");

  const det = await (await tari.request.get(`/api/event/${eventId}`)).json();
  expect(det.event.lampiran).toHaveLength(1);
  const row = await prisma.eventLampiran.findUniqueOrThrow({ where: { id: lampiranId } });
  expect(row.objectKey).toMatch(/^event\/2026-10\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);
  await tari.tutup();
});

test("ditolak: duplikat, .exe berkedok pdf, tipe di luar daftar, > 10 MB, tanpa file, dan batas 10 file", async ({ browser }) => {
  const tari = await sebagai(browser, USERS.tari.nip);

  const dup = await unggah(tari.request, eventId, "salinan.png", "image/png", contohPng());
  expect(dup.status()).toBe(409);
  expect((await dup.json()).pesan).toContain("sudah dilampirkan");

  const exe = await unggah(tari.request, eventId, "invoice.pdf", "application/pdf", contohExe());
  expect(exe.status()).toBe(400);
  expect((await exe.json()).pesan).toContain("Isi file tidak sesuai");
  expect((await unggah(tari.request, eventId, "catatan.txt", "text/plain", Buffer.from("halo"))).status()).toBe(400);

  const besar = await unggah(tari.request, eventId, "besar.pdf", "application/pdf", Buffer.concat([contohPdf(), Buffer.alloc(10 * 1024 * 1024)]));
  expect(besar.status()).toBe(413);
  expect((await besar.json()).pesan).toContain("10 MB");

  expect((await tari.request.post(`/api/event/${eventId}/lampiran`, { multipart: { x: "y" } })).status()).toBe(400);

  // Genapkan sampai 10 file, lalu file ke-11 ditolak.
  for (let i = 0; i < 9; i++) {
    expect((await unggah(tari.request, eventId, `tambahan-${i}.pdf`, "application/pdf", unik(`unik-${i}`))).status()).toBe(201);
  }
  const ke11 = await unggah(tari.request, eventId, "ke-11.pdf", "application/pdf", unik("ke-11"));
  expect(ke11.status()).toBe(409);
  expect((await ke11.json()).pesan).toContain("Maksimal 10 file");
  expect(await prisma.eventLampiran.count({ where: { eventId } })).toBe(10);
  await tari.tutup();
});

test("unduhan: pemilik dan ketua tim 302 ke signed URL (<= 15 menit); lainnya ditolak", async ({ browser, request }) => {
  const url = `/api/event-lampiran/${lampiranId}/download`;

  const tari = await sebagai(browser, USERS.tari.nip);
  const res = await tari.request.get(url, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["cache-control"]).toBe("no-store");
  const lokasi = new URL(res.headers().location);
  expect(lokasi.searchParams.get("X-Amz-Signature")).toBeTruthy();
  expect(Number(lokasi.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);
  const isi = await request.get(lokasi.toString());
  expect(isi.status()).toBe(200);
  expect(Buffer.from(await isi.body()).equals(contohPng())).toBe(true);
  await tari.tutup();

  const ketua = await sebagai(browser, USERS.ketua.nip);
  expect((await ketua.request.get(url, { maxRedirects: 0 })).status()).toBe(302);
  await ketua.tutup();

  for (const [nama, nip, status] of [
    ["rina", USERS.rina.nip, 404],
    ["ketua2", USERS.ketua2.nip, 404],
    ["pimpinan", USERS.pimpinan.nip, 403],
  ] as const) {
    const u = await sebagai(browser, nip);
    expect((await u.request.get(url, { maxRedirects: 0 })).status(), nama).toBe(status);
    await u.tutup();
  }
  expect((await request.get(url, { maxRedirects: 0 })).status()).toBe(401);
});

test("ketua tim hanya membaca: tidak boleh mengunggah atau menghapus lampiran", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  expect((await unggah(ketua.request, eventId, "x.pdf", "application/pdf", unik("ketua"))).status()).toBe(403);
  expect((await ketua.request.delete(`/api/event-lampiran/${lampiranId}`)).status()).toBe(403);
  const det = await (await ketua.request.get(`/api/event/${eventId}`)).json();
  expect(det.event.lampiran).toHaveLength(10); // ketua melihat daftar lampiran lengkap
  await ketua.tutup();
});

test("periode DIKUNCI: unggah dan hapus lampiran 409; dipulihkan setelahnya", async ({ browser }) => {
  const e = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const tari = await sebagai(browser, USERS.tari.nip);
  await prisma.periode.update({ where: { id: e.periodeId }, data: { status: "DIKUNCI" } });
  try {
    expect((await unggah(tari.request, eventId, "baru.pdf", "application/pdf", unik("kunci"))).status()).toBe(409);
    expect((await tari.request.delete(`/api/event-lampiran/${lampiranId}`)).status()).toBe(409);
  } finally {
    await prisma.periode.update({ where: { id: e.periodeId }, data: { status: "AKTIF" } }); // event ini ada di periode Oktober (AKTIF)
  }
  await tari.tutup();
});

test("hapus lampiran oleh pemilik; hapus event menghapus semua lampirannya", async ({ browser }) => {
  const tari = await sebagai(browser, USERS.tari.nip);
  expect((await tari.request.delete(`/api/event-lampiran/${lampiranId}`)).status()).toBe(200);
  expect((await tari.request.delete(`/api/event-lampiran/${lampiranId}`)).status()).toBe(404);
  expect(await prisma.eventLampiran.count({ where: { eventId } })).toBe(9);

  expect((await tari.request.delete(`/api/event/${eventId}`)).status()).toBe(200);
  expect(await prisma.eventLampiran.count({ where: { eventId } })).toBe(0);
  await tari.tutup();
});
