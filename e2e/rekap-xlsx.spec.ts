import ExcelJS from "exceljs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { signedDownloadUrl } from "../lib/storage";
import { USERS } from "./support/data";
import { anggotaTim, buatAlokasi, catat, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

let periodeId = "";
const U: Record<string, string> = {};
const bersihNama = (n: string) => n.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);

async function tungguSelesai(request: APIRequestContext) {
  const mulai = Date.now();
  for (;;) {
    const d = await (await request.get(`/api/rekap/${periodeId}`)).json();
    if (!d.sedangBerjalan) return d;
    if (Date.now() - mulai > 60_000) throw new Error("rekap tidak selesai");
    await new Promise((r) => setTimeout(r, 300));
  }
}
/** Tunggu file XLSX batch muncul (dibuat setelah seluruh rekap batch selesai). */
async function tungguXlsx(userId: string, versi: number) {
  for (let i = 0; i < 100; i++) {
    const r = await prisma.rekapSKP.findFirst({ where: { periodeId, userId, versi } });
    if (r?.fileXlsxKey) return r;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error("XLSX tidak muncul");
}
async function unduhXlsx(admin: APIRequestContext, anon: APIRequestContext, rekapId: string) {
  const r = await admin.get(`/api/rekap/${rekapId}/download?format=xlsx`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const lokasi = r.headers().location;
  expect(Number(new URL(lokasi).searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);
  const file = await anon.get(lokasi);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-disposition"]).toContain("attachment");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await file.body()) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return { wb, lokasi };
}
/** Baca bagian tabel pada sheet pegawai: judul bagian -> baris data (selama kolom A berupa angka). */
function bagian(ws: ExcelJS.Worksheet, judul: string) {
  let mulai = 0;
  ws.eachRow((r) => {
    if (!mulai && r.getCell(1).value === judul) mulai = r.number;
  });
  const out: ExcelJS.Row[] = [];
  for (let n = mulai + 2; n <= ws.rowCount; n++) {
    const r = ws.getRow(n);
    if (typeof r.getCell(1).value !== "number") break;
    out.push(r);
  }
  return out;
}
function totalPerSatuan(ws: ExcelJS.Worksheet) {
  let mulai = 0;
  ws.eachRow((r) => {
    if (!mulai && r.getCell(1).value === "Total per Satuan") mulai = r.number;
  });
  const m = new Map<string, { disetujui: number; menunggu: number }>();
  for (let n = mulai + 2; n <= ws.rowCount; n++) {
    const r = ws.getRow(n);
    if (!r.getCell(2).value) break;
    m.set(String(r.getCell(2).value), { disetujui: Number(r.getCell(5).value), menunggu: Number(r.getCell(7).value) });
  }
  return m;
}
async function sumDb(userId: string) {
  const rows = await prisma.pekerjaanHarian.findMany({ where: { userId, periodeId } });
  const m = new Map<string, { disetujui: number; menunggu: number }>();
  for (const r of rows) {
    const x = m.get(r.satuan) ?? { disetujui: 0, menunggu: 0 };
    if (r.statusVerifikasi === "DISETUJUI") x.disetujui += Number(r.volume);
    if (r.statusVerifikasi === "MENUNGGU") x.menunggu += Number(r.volume);
    m.set(r.satuan, x);
  }
  return m;
}

test("setup: tiga skenario capaian (campuran, semua disetujui, tanpa satu pun disetujui)", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  const tim = (await timMilik(ketua.request)).id;
  const u = await anggotaTim(ketua.request, tim, periodeId);
  U.yul = u(USERS.yul.nama);
  U.rina = u(USERS.rina.nama);
  U.tari = u(USERS.tari.nama);
  const al = await buatAlokasi(ketua.request, { timId: tim, periodeId, judul: "XLSX alokasi satu", userIds: [U.yul, U.rina, U.tari], target: 40 });
  const al2 = await buatAlokasi(ketua.request, { timId: tim, periodeId, judul: "XLSX alokasi dua", userIds: [U.yul, U.tari], target: 15 });
  const pen = (a: typeof al, id: string) => a.penugasan.find((p) => p.userId === id)!.id;
  const v = (id: string, data: object) => ketua.request.post(`/api/pekerjaan-harian/${id}/verifikasi`, { data });

  const yul = await sebagai(browser, USERS.yul.nip);
  const e1 = await catat(yul.request, pen(al, U.yul), "XLSX Yul setuju", 9, "2026-10-14");
  const e2 = await catat(yul.request, pen(al2, U.yul), "XLSX Yul setuju dua", 3, "2026-10-13");
  const e3 = await catat(yul.request, pen(al, U.yul), "XLSX Yul revisi", 5, "2026-10-12");
  await catat(yul.request, pen(al, U.yul), "XLSX Yul menunggu", 2, "2026-10-14");
  const a = await yul.request.post("/api/pekerjaan-harian", { data: { isAdHoc: true, judulAdHoc: "XLSX tugas tambahan", tanggal: "2026-10-14", deskripsiCapaian: "XLSX adhoc", volume: 3, satuan: "kegiatan" } });
  const e5 = (await a.json()).entri.id as string;
  await yul.tutup();
  for (const id of [e1, e2, e5]) expect((await v(id, { aksi: "SETUJUI" })).status()).toBe(200);
  expect((await v(e3, { aksi: "MINTA_REVISI", catatan: "Perbaiki volume entri ini." })).status()).toBe(200);

  const rina = await sebagai(browser, USERS.rina.nip);
  const r1 = await catat(rina.request, pen(al, U.rina), "XLSX Rina satu", 7, "2026-10-14");
  const r2 = await catat(rina.request, pen(al, U.rina), "XLSX Rina dua", 8, "2026-10-13");
  await rina.tutup();
  for (const id of [r1, r2]) expect((await v(id, { aksi: "SETUJUI" })).status()).toBe(200);

  const tari = await sebagai(browser, USERS.tari.nip);
  const t1 = await catat(tari.request, pen(al, U.tari), "XLSX Tari menunggu", 6, "2026-10-14");
  const t2 = await catat(tari.request, pen(al2, U.tari), "XLSX Tari revisi", 4, "2026-10-13");
  const t3 = await catat(tari.request, pen(al2, U.tari), "XLSX Tari tolak", 2, "2026-10-12");
  await tari.tutup();
  void t1;
  expect((await v(t2, { aksi: "MINTA_REVISI", catatan: "Perbaiki dulu catatan ini." })).status()).toBe(200);
  expect((await v(t3, { aksi: "TOLAK", catatan: "Tidak termasuk alokasi ini." })).status()).toBe(200);
  await ketua.tutup();
});

test("XLSX batch: sheet Ringkasan + sheet per pegawai; baris = jumlah alokasi; total = SUM(DISETUJUI)", async ({ browser, request }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const gen = await admin.request.post("/api/rekap/generate", { data: { periodeId } });
  expect(gen.status()).toBe(202);
  const d = await tungguSelesai(admin.request);
  const rekapYul = await tungguXlsx(U.yul, (await prisma.rekapSKP.count({ where: { periodeId, userId: U.yul } })));
  const { wb, lokasi } = await unduhXlsx(admin.request, request, rekapYul.id);

  const selesai = (d.data as { rekap: { status: string } | null }[]).filter((x) => x.rekap?.status === "SELESAI").length;
  expect(wb.worksheets.map((w) => w.name)[0]).toBe("Ringkasan");
  expect(wb.worksheets.length - 1, "satu sheet detail per pegawai").toBe(selesai);
  for (const ws of wb.worksheets) expect(ws.name.length).toBeLessThanOrEqual(31);
  expect(lokasi).toContain("X-Amz-Signature");

  // Ringkasan memuat seluruh pegawai pada batch.
  const nama = new Set<string>();
  wb.getWorksheet("Ringkasan")!.eachRow((r) => typeof r.getCell(1).value === "number" && nama.add(String(r.getCell(3).value)));
  expect(nama.size).toBe(d.data.length);

  for (const [kunci, pengguna] of [["yul", USERS.yul], ["rina", USERS.rina], ["tari", USERS.tari]] as const) {
    const ws = wb.getWorksheet(bersihNama(pengguna.nama))!;
    expect(ws, kunci).toBeTruthy();
    const dbSum = await sumDb(U[kunci]);

    // Jumlah baris tabel alokasi = jumlah alokasi pegawai (yang tidak dibatalkan tanpa capaian).
    const penugasan = await prisma.penugasanAlokasi.findMany({ where: { userId: U[kunci], alokasi: { periodeId } }, include: { alokasi: true } });
    // Aturan rekap: alokasi dibatalkan hanya tampil bila sudah punya capaian yang disetujui.
    const disetujui = await prisma.pekerjaanHarian.groupBy({ by: ["penugasanId"], where: { userId: U[kunci], periodeId, statusVerifikasi: "DISETUJUI", penugasanId: { not: null } }, _sum: { volume: true } });
    const adaCapaian = new Set(disetujui.filter((x) => Number(x._sum.volume ?? 0) > 0).map((x) => x.penugasanId));
    const harapan = penugasan.filter((p) => p.alokasi.status !== "DIBATALKAN" || adaCapaian.has(p.id)).length;
    const alokasi = bagian(ws, "Alokasi");
    expect(alokasi.length, `${kunci}: baris alokasi`).toBe(harapan);

    // Total pada blok "Total per Satuan" sama persis dengan SUM(volume) entri DISETUJUI di DB.
    const total = totalPerSatuan(ws);
    for (const [satuan, v] of dbSum) {
      expect(total.get(satuan)?.disetujui ?? 0, `${kunci} ${satuan} disetujui`).toBe(v.disetujui);
      expect(total.get(satuan)?.menunggu ?? 0, `${kunci} ${satuan} menunggu`).toBe(v.menunggu);
    }
    // Jumlah sel Realisasi pada tabel (alokasi + tugas tambahan) per satuan juga sama.
    const dariTabel = new Map<string, number>();
    for (const r of alokasi) dariTabel.set(String(r.getCell(3).value), (dariTabel.get(String(r.getCell(3).value)) ?? 0) + Number(r.getCell(5).value));
    for (const r of bagian(ws, "Tugas Tambahan")) dariTabel.set(String(r.getCell(3).value), (dariTabel.get(String(r.getCell(3).value)) ?? 0) + Number(r.getCell(5).value));
    for (const [satuan, v] of dbSum) expect(dariTabel.get(satuan) ?? 0, `${kunci} ${satuan} jumlah baris`).toBe(v.disetujui);
  }

  // Skenario 3 (Tari): tidak ada yang disetujui pada alokasi; menunggu dilaporkan terpisah.
  const wsTari = wb.getWorksheet(bersihNama(USERS.tari.nama))!;
  const baris = bagian(wsTari, "Alokasi");
  const satu = baris.find((r) => String(r.getCell(2).value) === "XLSX alokasi satu")!;
  expect(Number(satu.getCell(5).value), "menunggu & revisi tidak dihitung").toBe(0);
  expect(Number(satu.getCell(7).value)).toBe(6);
  const dua = baris.find((r) => String(r.getCell(2).value) === "XLSX alokasi dua")!;
  expect(Number(dua.getCell(5).value), "revisi/tolak dikecualikan").toBe(0);
  expect(Number(dua.getCell(7).value)).toBe(0);

  // Yul: persentase & tanggal pelaksanaan dari entri DISETUJUI saja.
  const wsYul = wb.getWorksheet(bersihNama(USERS.yul.nama))!;
  const s1 = bagian(wsYul, "Alokasi").find((r) => String(r.getCell(2).value) === "XLSX alokasi satu")!;
  expect(Number(s1.getCell(5).value)).toBeGreaterThanOrEqual(9);
  expect(String(s1.getCell(9).value)).toContain("14 Okt");
  await admin.tutup();
});

test("generate ulang: file versi baru terpisah, file versi lama tetap bisa diunduh", async ({ browser, request }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const versiLama = await prisma.rekapSKP.count({ where: { periodeId, userId: U.yul } });
  const lama = await tungguXlsx(U.yul, versiLama);

  expect((await admin.request.post("/api/rekap/generate", { data: { periodeId } })).status()).toBe(202);
  await tungguSelesai(admin.request);
  const baru = await tungguXlsx(U.yul, versiLama + 1);
  expect(baru.fileXlsxKey).not.toBe(lama.fileXlsxKey);
  expect(baru.batchId).not.toBe(lama.batchId);

  // Versi lama tidak ditimpa: kuncinya tetap dan objeknya masih ada.
  const lamaSesudah = await prisma.rekapSKP.findUniqueOrThrow({ where: { id: lama.id } });
  expect(lamaSesudah.fileXlsxKey).toBe(lama.fileXlsxKey);
  const ada = await request.get(await signedDownloadUrl(lama.fileXlsxKey!, { namaFile: "x.xlsx", contentType: "application/octet-stream", inline: false }));
  expect(ada.status()).toBe(200);
  const { wb } = await unduhXlsx(admin.request, request, lama.id);
  expect(wb.getWorksheet("Ringkasan")).toBeTruthy();
  await admin.tutup();
});

test("kontrol akses unduhan XLSX: ketua tim & pegawai ditolak; id/format tidak valid; tanpa sesi 401", async ({ browser, request }) => {
  const rekap = await prisma.rekapSKP.findFirstOrThrow({ where: { periodeId, userId: U.yul, status: "SELESAI" }, orderBy: { versi: "desc" } });
  const url = `/api/rekap/${rekap.id}/download?format=xlsx`;
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const k = await ketua.request.get(url, { maxRedirects: 0 });
  expect(k.status()).toBe(403);
  expect((await k.json()).pesan).toContain("seluruh pegawai");
  await ketua.tutup();
  const yul = await sebagai(browser, USERS.yul.nip);
  expect((await yul.request.get(url, { maxRedirects: 0 })).status()).toBe(403);
  await yul.tutup();
  expect((await request.get(url, { maxRedirects: 0 })).status()).toBe(401);

  const pim = await sebagai(browser, USERS.pimpinan.nip);
  expect((await pim.request.get(url, { maxRedirects: 0 })).status(), "pimpinan boleh").toBe(302);
  expect((await pim.request.get(`/api/rekap/${rekap.id}/download?format=docx`, { maxRedirects: 0 })).status()).toBe(400);
  expect((await pim.request.get("/api/rekap/00000000-0000-4000-8000-000000000999/download", { maxRedirects: 0 })).status()).toBe(404);
  expect((await pim.request.get("/api/rekap/bukan-uuid/download", { maxRedirects: 0 })).status()).toBe(404);
  await pim.tutup();
});
