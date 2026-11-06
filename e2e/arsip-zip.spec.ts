import AdmZip from "adm-zip";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import bcrypt from "bcryptjs";
import { contohJpg, contohPdf, contohPng } from "../lib/testing/mini-zip";
import { E2E_PASSWORD, USERS } from "./support/data";
import { anggotaTim, buatAlokasi, catat, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

let periodeId = "";
let yulId = "";

const unggah = (request: APIRequestContext, entriId: string, name: string, mimeType: string, buffer: Buffer) =>
  request.post(`/api/pekerjaan-harian/${entriId}/bukti`, { multipart: { file: { name, mimeType, buffer } } });

async function tunggu(request: APIRequestContext) {
  const mulai = Date.now();
  for (;;) {
    const d = await (await request.get(`/api/rekap/${periodeId}`)).json();
    if (!d.sedangBerjalan) return d;
    if (Date.now() - mulai > 90_000) throw new Error("rekap tidak selesai");
    await new Promise((r) => setTimeout(r, 300));
  }
}

test("setup: Yul punya bukti pada dua tanggal, dua alokasi, dan satu tugas tambahan", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  const tim = (await timMilik(ketua.request)).id;
  const cari = await anggotaTim(ketua.request, tim, periodeId);
  yulId = cari(USERS.yul.nama);
  const a = await buatAlokasi(ketua.request, { timId: tim, periodeId, judul: "ZIP Alokasi Satu", userIds: [yulId], target: 50 });
  const b = await buatAlokasi(ketua.request, { timId: tim, periodeId, judul: "ZIP Alokasi Dua", userIds: [yulId], target: 50 });
  await ketua.tutup();

  const yul = await sebagai(browser, USERS.yul.nip);
  const e1 = await catat(yul.request, a.penugasan[0].id, "ZIP entri satu", 2, "2026-10-13");
  const e2 = await catat(yul.request, a.penugasan[0].id, "ZIP entri dua", 2, "2026-10-14");
  const e3 = await catat(yul.request, b.penugasan[0].id, "ZIP entri tiga", 2, "2026-10-14");
  const adHoc = await yul.request.post("/api/pekerjaan-harian", {
    data: { isAdHoc: true, judulAdHoc: "Rapat koordinasi", satuan: "kegiatan", tanggal: "2026-10-14", deskripsiCapaian: "ZIP tugas tambahan", volume: 1 },
  });
  expect(adHoc.status()).toBe(201);
  const e4 = (await adHoc.json()).entri.id as string;

  expect((await unggah(yul.request, e1, "zipuji-foto.png", "image/png", contohPng())).status()).toBe(201);
  expect((await unggah(yul.request, e2, "zipuji-foto.png", "image/png", contohPng())).status(), "nama kembar beda entri tidak bentrok").toBe(201);
  expect((await unggah(yul.request, e3, "zipuji-scan.pdf", "application/pdf", contohPdf())).status()).toBe(201);
  expect((await unggah(yul.request, e4, "zipuji-notulen.jpg", "image/jpeg", contohJpg())).status()).toBe(201);
  await yul.tutup();
});

test("ZIP: struktur folder per tanggal lalu per alokasi, plus manifest", async ({ browser, request }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const r = await admin.request.get(`/api/rekap/${periodeId}/bukti-zip?userId=${yulId}`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const lokasi = r.headers().location;
  expect(Number(new URL(lokasi).searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);

  const f = await request.get(lokasi);
  expect(f.status()).toBe(200);
  expect(f.headers()["content-type"]).toBe("application/zip");
  expect(f.headers()["content-disposition"]).toMatch(/Bukti-.*Oktober-2026\.zip/);
  const zip = new AdmZip(Buffer.from(await f.body()));
  const nama = zip.getEntries().map((e) => e.entryName);

  const akar = nama.find((n) => n.endsWith("_daftar-bukti.csv"))!.replace("/_daftar-bukti.csv", "");
  expect(akar).toContain(USERS.yul.nama);
  expect(akar).toContain("Oktober-2026");
  for (const j of [
    `${akar}/2026-10-13/ZIP Alokasi Satu/zipuji-foto.png`,
    `${akar}/2026-10-14/ZIP Alokasi Satu/zipuji-foto.png`,
    `${akar}/2026-10-14/ZIP Alokasi Dua/zipuji-scan.pdf`,
    `${akar}/2026-10-14/Tugas Tambahan - Rapat koordinasi/zipuji-notulen.jpg`,
  ]) {
    expect(nama, j).toContain(j);
  }
  // Isi berkas utuh (PDF tetap berawalan %PDF-).
  expect(zip.readFile(`${akar}/2026-10-14/ZIP Alokasi Dua/zipuji-scan.pdf`)!.subarray(0, 5).toString()).toBe("%PDF-");
  // Tidak ada jalur yang keluar dari folder akar.
  expect(nama.every((n) => n.startsWith(`${akar}/`) && !n.includes(".."))).toBe(true);

  const csv = zip.readAsText(`${akar}/_daftar-bukti.csv`);
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain("zipuji-scan.pdf");
  expect(csv).toContain("ZIP tugas tambahan");

  const audit = await prisma.auditLog.count({ where: { aksi: "UNDUH_ZIP_BUKTI", entitasId: periodeId } });
  expect(audit).toBeGreaterThan(0);
  await admin.tutup();
});

test("ZIP: hanya Admin/Pimpinan; pegawai tanpa bukti 404; tanpa sesi 401", async ({ browser, request }) => {
  const url = `/api/rekap/${periodeId}/bukti-zip?userId=${yulId}`;
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const timId = (await timMilik(ketua.request)).id; // diambil sebelum context ditutup
  expect((await ketua.request.get(url, { maxRedirects: 0 })).status()).toBe(403);
  await ketua.tutup();
  const yul = await sebagai(browser, USERS.yul.nip);
  expect((await yul.request.get(url, { maxRedirects: 0 })).status()).toBe(403);
  await yul.tutup();
  expect((await request.get(url, { maxRedirects: 0 })).status()).toBe(401);

  // Pegawai tanpa satu pun bukti pada periode ini.
  // Dibuat sendiri secara deterministik: jangan andalkan sisa data test lain
  // (dulu pakai test.skip kondisional — jalur 404 bisa hilang tanpa pernah diuji).
  const NIP_KOSONG = "199666666666666666";
  await prisma.buktiDukung.deleteMany({ where: { pekerjaanHarian: { periodeId, user: { nip: NIP_KOSONG } } } });
  await prisma.pekerjaanHarian.deleteMany({ where: { periodeId, user: { nip: NIP_KOSONG } } });
  await prisma.anggotaTim.deleteMany({ where: { periodeId, user: { nip: NIP_KOSONG } } });
  await prisma.rekapSKP.deleteMany({ where: { pegawai: { nip: NIP_KOSONG } } });
  await prisma.user.deleteMany({ where: { nip: NIP_KOSONG } });
  const kosongUser = await prisma.user.create({
    data: { nip: NIP_KOSONG, nama: "Pegawai Tanpa Bukti Uji", role: "PEGAWAI", passwordHash: await bcrypt.hash(E2E_PASSWORD, 4) },
  });
  const kosongAnggota = await prisma.anggotaTim.create({
    data: { timId, userId: kosongUser.id, periodeId, peranDalamTim: "ANGGOTA" },
  });
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  try {
    const r = await pim.request.get(`/api/rekap/${periodeId}/bukti-zip?userId=${kosongUser.id}`, { maxRedirects: 0 });
    expect(r.status()).toBe(404);
    expect((await r.json()).pesan).toContain("belum memiliki bukti dukung");
  } finally {
    await prisma.anggotaTim.delete({ where: { id: kosongAnggota.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: kosongUser.id } }).catch(() => undefined);
    await pim.tutup();
  }
});

test("ZIP > 500 MB ditolak (413) dengan pesan Bahasa Indonesia", async ({ browser }) => {
  // Batas 10 MB per berkas ditegakkan CHECK basis data, jadi total >500 MB dibentuk dari 51 baris metadata
  // 10 MB (objek tidak perlu ada: penolakan terjadi sebelum ada objek yang dibaca). Dibersihkan setelahnya.
  const admin = await sebagai(browser, USERS.admin.nip);
  const induk = await prisma.buktiDukung.findFirstOrThrow({ where: { pekerjaanHarian: { periodeId, userId: yulId } } });
  const awalan = `uji-besar/${Date.now()}`;
  await prisma.buktiDukung.createMany({
    data: Array.from({ length: 51 }, (_, i) => ({
      pekerjaanHarianId: induk.pekerjaanHarianId,
      namaAsli: `besar-${i}.pdf`,
      objectKey: `${awalan}/${i}.pdf`,
      mimeType: "application/pdf",
      ukuranBytes: BigInt(10 * 1024 * 1024),
      checksumSha256: String(i).padStart(64, "0"),
      uploadedById: yulId,
    })),
  });
  try {
    const r = await admin.request.get(`/api/rekap/${periodeId}/bukti-zip?userId=${yulId}`, { maxRedirects: 0 });
    expect(r.status()).toBe(413);
    const pesan = (await r.json()).pesan as string;
    expect(pesan).toContain("melebihi batas unduhan ZIP 500,0 MB");
    expect(pesan).toMatch(/Unduh bukti per catatan harian/);
  } finally {
    await prisma.buktiDukung.deleteMany({ where: { objectKey: { startsWith: awalan } } });
  }
  await admin.tutup();
});

test("generate ulang menambah versi; versi lama tetap tersimpan dan bisa diunduh", async ({ browser, request }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  expect((await admin.request.post("/api/rekap/generate", { data: { periodeId, userIds: [yulId] } })).status()).toBe(202);
  await tunggu(admin.request);
  expect((await admin.request.post("/api/rekap/generate", { data: { periodeId, userIds: [yulId] } })).status()).toBe(202);
  await tunggu(admin.request);

  const r = await admin.request.get(`/api/rekap/${periodeId}/versi?userId=${yulId}`);
  expect(r.status()).toBe(200);
  const versi = (await r.json()).data as { id: string; versi: number; status: string; adaPdf: boolean; digeneratOleh: string }[];
  expect(versi.length).toBeGreaterThanOrEqual(2);
  const nomor = versi.map((v) => v.versi);
  expect(nomor).toEqual([...nomor].sort((a, b) => b - a));
  expect(new Set(nomor).size).toBe(nomor.length);
  expect(versi[0].digeneratOleh).toBe(USERS.admin.nama);

  // Setiap versi selesai punya file PDF sendiri yang masih bisa diunduh (bukan ditimpa).
  const selesai = versi.filter((v) => v.status === "SELESAI" && v.adaPdf);
  expect(selesai.length).toBeGreaterThanOrEqual(2);
  const kunci = await prisma.rekapSKP.findMany({ where: { id: { in: selesai.map((v) => v.id) } }, select: { filePdfKey: true } });
  expect(new Set(kunci.map((k) => k.filePdfKey)).size).toBe(selesai.length);
  for (const v of selesai.slice(0, 2)) {
    const d = await admin.request.get(`/api/rekap/${v.id}/download?format=pdf`, { maxRedirects: 0 });
    expect(d.status()).toBe(302);
    const f = await request.get(d.headers().location);
    expect(f.status()).toBe(200);
    expect(Buffer.from(await f.body()).subarray(0, 5).toString()).toBe("%PDF-");
  }

  // Ketua tim hanya melihat riwayat anggota timnya.
  const ketua = await sebagai(browser, USERS.ketua.nip);
  expect((await ketua.request.get(`/api/rekap/${periodeId}/versi?userId=${yulId}`)).status()).toBe(200);
  await ketua.tutup();
  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  expect((await ketua2.request.get(`/api/rekap/${periodeId}/versi?userId=${yulId}`)).status()).toBe(404);
  await ketua2.tutup();
  await admin.tutup();
});

test("UI: riwayat versi dan tautan ZIP bukti tampil pada halaman Rekap", async ({ browser }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const page = admin.page;
  await page.goto("/rekap", { waitUntil: "networkidle" });
  const baris = page.locator(`[data-pegawai="${yulId}"]`);
  await expect(baris.getByRole("link", { name: `Unduh ZIP bukti dukung ${USERS.yul.nama}` })).toBeVisible();
  await baris.getByRole("button", { name: `Riwayat versi rekap ${USERS.yul.nama}` }).click();
  const riwayat = page.locator(`[data-riwayat="${yulId}"]`);
  await expect(riwayat.locator("[data-versi]").first()).toBeVisible();
  expect(await riwayat.locator("[data-versi]").count()).toBeGreaterThanOrEqual(2);
  await expect(riwayat.getByRole("link", { name: new RegExp(`Unduh PDF ${USERS.yul.nama} versi [0-9]+`) }).first()).toBeVisible();
  await admin.tutup();
});
