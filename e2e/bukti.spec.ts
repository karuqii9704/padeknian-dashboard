import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { contohDocx, contohExe, contohJpg, contohPdf, contohPng, contohXlsx } from "../lib/testing/mini-zip";
import { signedDownloadUrl } from "../lib/storage";
import { USERS } from "./support/data";
import { loginUI } from "./support/auth";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

async function sebagai(browser: Browser, nip: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginUI(page, nip);
  return { request: page.request, tutup: () => ctx.close() };
}
const unggah = (request: APIRequestContext, entriId: string, name: string, mimeType: string, buffer: Buffer) =>
  request.post(`/api/pekerjaan-harian/${entriId}/bukti`, { multipart: { file: { name, mimeType, buffer } } });

let entriId = "";
let entriLain = "";
let periodeId = "";
let yulId = "";
const buktiIds: Record<string, string> = {};

test("setup: ketua membuat alokasi; Yul membuat entri; Rina membuat entri sendiri", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const periode = ((await (await ketua.request.get("/api/periode")).json()).data as { id: string; status: string }[]).find((p) => p.status === "AKTIF")!;
  periodeId = periode.id;
  const tim = (await (await ketua.request.get("/api/tim")).json()).data[0] as { id: string };
  const anggota = (await (await ketua.request.get(`/api/tim/${tim.id}/anggota?periodeId=${periode.id}`)).json()).anggota as { userId: string; nama: string }[];
  yulId = anggota.find((a) => a.nama === USERS.yul.nama)!.userId;
  const rinaId = anggota.find((a) => a.nama === USERS.rina.nama)!.userId;
  const r = await ketua.request.post("/api/alokasi", {
    data: {
      timId: tim.id,
      periodeId: periode.id,
      judul: "Uji bukti dukung",
      deskripsi: "uji",
      tanggalMulai: "2026-10-01",
      tanggalSelesai: "2026-10-30",
      targetVolume: 100,
      satuan: "dokumen",
      prioritas: "SEDANG",
      penugasan: [{ userId: yulId }, { userId: rinaId }],
    },
  });
  const pen = (await r.json()).alokasi.penugasan as { id: string; userId: string }[];
  await ketua.tutup();

  const yul = await sebagai(browser, USERS.yul.nip);
  const e = await yul.request.post("/api/pekerjaan-harian", {
    data: { penugasanId: pen.find((p) => p.userId === yulId)!.id, tanggal: "2026-10-14", deskripsiCapaian: "Entri dengan bukti", volume: 5 },
  });
  entriId = (await e.json()).entri.id;
  await yul.tutup();

  const rina = await sebagai(browser, USERS.rina.nip);
  const e2 = await rina.request.post("/api/pekerjaan-harian", {
    data: { penugasanId: pen.find((p) => p.userId === rinaId)!.id, tanggal: "2026-10-14", deskripsiCapaian: "Entri Rina", volume: 5 },
  });
  entriLain = (await e2.json()).entri.id;
  await rina.tutup();
});

test("format valid (jpg, png, pdf, docx, xlsx) tersimpan dengan nama UUID dan metadata benar", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const kasus: [string, string, Buffer, string][] = [
    ["foto kegiatan.jpg", "image/jpeg", contohJpg(), "jpg"],
    ["scan.png", "image/png", contohPng(), "png"],
    ["laporan.pdf", "application/pdf", contohPdf(), "pdf"],
    ["notulen.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", contohDocx(), "docx"],
    ["rekap.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contohXlsx(), "xlsx"],
  ];
  for (const [nama, mime, buf, ext] of kasus) {
    const res = await unggah(yul.request, entriId, nama, mime, buf);
    expect(res.status(), nama).toBe(201);
    const body = (await res.json()).bukti;
    expect(body.namaAsli).toBe(nama);
    expect(body).not.toHaveProperty("objectKey");
    buktiIds[ext] = body.id;

    const row = await prisma.buktiDukung.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.objectKey).toMatch(new RegExp(`^periode/2026-10/${yulId}/[0-9a-f-]{36}\\.${ext}$`));
    expect(row.mimeType).toBe(mime);
    expect(Number(row.ukuranBytes)).toBe(buf.length);
    expect(row.checksumSha256).toBe(createHash("sha256").update(buf).digest("hex"));
    expect(row.uploadedById).toBe(yulId);
  }
  await yul.tutup();
});

test("ditolak: .exe berkedok .pdf, tipe di luar daftar, > 10 MB, duplikat, dan batas 10 file", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);

  const exeSebagaiPdf = await unggah(yul.request, entriId, "invoice.pdf", "application/pdf", contohExe());
  expect(exeSebagaiPdf.status()).toBe(400);
  expect((await exeSebagaiPdf.json()).pesan).toContain("Isi file tidak sesuai");
  expect((await unggah(yul.request, entriId, "invoice.pdf", "application/octet-stream", contohExe())).status()).toBe(400);
  expect((await unggah(yul.request, entriId, "catatan.txt", "text/plain", Buffer.from("halo"))).status()).toBe(400);
  expect((await unggah(yul.request, entriId, "foto.jpg", "image/jpeg", contohPdf())).status()).toBe(400); // PDF berlabel JPEG

  const besar = Buffer.concat([contohPdf(), Buffer.alloc(10 * 1024 * 1024)]); // > 10 MB
  const rBesar = await unggah(yul.request, entriId, "besar.pdf", "application/pdf", besar);
  expect(rBesar.status()).toBe(413);
  expect((await rBesar.json()).pesan).toContain("10 MB");

  const dup = await unggah(yul.request, entriId, "salinan.pdf", "application/pdf", contohPdf());
  expect(dup.status()).toBe(409);
  expect((await dup.json()).pesan).toContain("sudah dilampirkan");

  // Tanpa file.
  expect((await yul.request.post(`/api/pekerjaan-harian/${entriId}/bukti`, { multipart: { x: "y" } })).status()).toBe(400);

  // Genapkan sampai 10 file, lalu file ke-11 ditolak.
  for (let i = 0; i < 5; i++) {
    const unik = Buffer.concat([contohPdf(), Buffer.from(`unik-${i}`)]);
    expect((await unggah(yul.request, entriId, `tambahan-${i}.pdf`, "application/pdf", unik)).status()).toBe(201);
  }
  const ke11 = await unggah(yul.request, entriId, "ke-11.pdf", "application/pdf", Buffer.concat([contohPdf(), Buffer.from("ke-11")]));
  expect(ke11.status()).toBe(409);
  expect((await ke11.json()).pesan).toContain("Maksimal 10 file");
  expect(await prisma.buktiDukung.count({ where: { pekerjaanHarianId: entriId } })).toBe(10);
  await yul.tutup();
});

test("akses object storage: tanpa signed URL gagal; signed URL berumur <= 15 menit dan kedaluwarsa", async ({ browser, request }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const row = await prisma.buktiDukung.findUniqueOrThrow({ where: { id: buktiIds.jpg } });
  const bucket = process.env.S3_BUCKET!;
  const langsung = await request.get(`${process.env.S3_PUBLIC_ENDPOINT}/${bucket}/${row.objectKey}`);
  expect([401, 403], "bucket privat: URL tanpa tanda tangan ditolak").toContain(langsung.status());

  // Lewat API: 302 ke signed URL.
  const res = await yul.request.get(`/api/bukti/${buktiIds.jpg}/download`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()["cache-control"]).toBe("no-store");
  const lokasi = new URL(res.headers().location);
  expect(lokasi.searchParams.get("X-Amz-Signature")).toBeTruthy();
  expect(Number(lokasi.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);
  const isi = await request.get(lokasi.toString());
  expect(isi.status()).toBe(200);
  expect(isi.headers()["content-type"]).toBe("image/jpeg");
  expect(isi.headers()["content-disposition"]).toContain("inline");
  expect(Buffer.from(await isi.body()).equals(contohJpg())).toBe(true);

  // Dokumen non-pratinjau diunduh sebagai attachment.
  const docx = await yul.request.get(`/api/bukti/${buktiIds.docx}/download`, { maxRedirects: 0 });
  const dok = await request.get(docx.headers().location);
  expect(dok.headers()["content-disposition"]).toContain("attachment");

  // Umur URL tidak bisa melebihi 15 menit walau diminta lebih lama.
  const panjang = new URL(await signedDownloadUrl(row.objectKey, { expiresIn: 99_999, namaFile: "x.jpg", contentType: "image/jpeg", inline: true }));
  expect(Number(panjang.searchParams.get("X-Amz-Expires"))).toBe(900);

  // URL berumur 1 detik kedaluwarsa.
  const singkat = await signedDownloadUrl(row.objectKey, { expiresIn: 1, namaFile: "x.jpg", contentType: "image/jpeg", inline: true });
  await new Promise((r) => setTimeout(r, 3000));
  expect((await request.get(singkat)).status()).toBe(403);
  await yul.tutup();
});

test("otorisasi unduhan: pemilik, ketua tim, pimpinan boleh; pegawai lain & tanpa sesi tidak", async ({ browser, request }) => {
  const id = buktiIds.pdf;
  for (const [nama, nip] of [["ketua", USERS.ketua.nip], ["pimpinan", USERS.pimpinan.nip]] as const) {
    const u = await sebagai(browser, nip);
    expect((await u.request.get(`/api/bukti/${id}/download`, { maxRedirects: 0 })).status(), nama).toBe(302);
    await u.tutup();
  }
  const rina = await sebagai(browser, USERS.rina.nip);
  expect((await rina.request.get(`/api/bukti/${id}/download`, { maxRedirects: 0 })).status()).toBe(404);
  await rina.tutup();
  expect((await request.get(`/api/bukti/${id}/download`, { maxRedirects: 0 })).status()).toBe(401);
});

test("detail entri memuat daftar bukti tanpa object key; daftar entri memuat jumlahBukti", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const det = await (await yul.request.get(`/api/pekerjaan-harian/${entriId}`)).json();
  expect(det.entri.bukti).toHaveLength(10);
  expect(JSON.stringify(det)).not.toContain("objectKey");
  expect(det.entri.bukti[0].tautan).toMatch(/^\/api\/bukti\/[0-9a-f-]{36}\/download$/);
  const list = await (await yul.request.get(`/api/pekerjaan-harian?periodeId=${periodeId}&pageSize=200`)).json();
  const e = list.data.find((x: { id: string }) => x.id === entriId);
  expect(e.jumlahBukti).toBe(10);
  await yul.tutup();
});

test("aturan akses unggah: milik orang lain 403; DISETUJUI & periode DIKUNCI 409; revisi kembali MENUNGGU", async ({ browser }) => {
  const rina = await sebagai(browser, USERS.rina.nip);
  const unik = (s: string) => Buffer.concat([contohPdf(), Buffer.from(s)]);
  expect((await unggah(rina.request, entriId, "x.pdf", "application/pdf", unik("a"))).status()).toBe(403);

  // Entri Rina sendiri: DISETUJUI -> 409.
  await prisma.pekerjaanHarian.update({ where: { id: entriLain }, data: { statusVerifikasi: "DISETUJUI" } });
  expect((await unggah(rina.request, entriLain, "x.pdf", "application/pdf", unik("b"))).status()).toBe(409);

  // Periode DIKUNCI -> 409.
  await prisma.pekerjaanHarian.update({ where: { id: entriLain }, data: { statusVerifikasi: "MENUNGGU" } });
  await prisma.periode.update({ where: { id: periodeId }, data: { status: "DIKUNCI" } });
  try {
    expect((await unggah(rina.request, entriLain, "x.pdf", "application/pdf", unik("c"))).status()).toBe(409);
  } finally {
    await prisma.periode.update({ where: { id: periodeId }, data: { status: "AKTIF" } });
  }

  // MINTA_REVISI: menambah bukti mengajukan ulang entri.
  await prisma.pekerjaanHarian.update({ where: { id: entriLain }, data: { statusVerifikasi: "MINTA_REVISI" } });
  expect((await unggah(rina.request, entriLain, "revisi.pdf", "application/pdf", unik("d"))).status()).toBe(201);
  expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: entriLain } })).statusVerifikasi).toBe("MENUNGGU");
  await rina.tutup();
});
