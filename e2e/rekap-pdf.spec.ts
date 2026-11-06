import ExcelJS from "exceljs";
import { extractText, getDocumentProxy } from "unpdf";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import bcrypt from "bcryptjs";
import type { RingkasanRekap } from "../lib/rekap-hitung";
import { E2E_PASSWORD, NIP_GAGAL, USERS } from "./support/data";
import { anggotaTim, buatAlokasi, catat, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

let periodeId = "";
let yulId = "";
let rekapYul = "";

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

async function tunggu(request: APIRequestContext) {
  const mulai = Date.now();
  for (;;) {
    const d = await (await request.get(`/api/rekap/${periodeId}`)).json();
    if (!d.sedangBerjalan) return d;
    if (Date.now() - mulai > 90_000) throw new Error("rekap tidak selesai");
    await new Promise((r) => setTimeout(r, 300));
  }
}
async function unduh(user: APIRequestContext, anon: APIRequestContext, id: string, format: "pdf" | "xlsx") {
  const r = await user.get(`/api/rekap/${id}/download?format=${format}`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const lokasi = r.headers().location;
  expect(Number(new URL(lokasi).searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);
  const f = await anon.get(lokasi);
  expect(f.status()).toBe(200);
  return { body: Buffer.from(await f.body()), headers: f.headers() };
}

test("setup: generate batch baru oleh admin dan tunggu selesai", async ({ browser }) => {
  // Data sendiri agar spec ini tidak bergantung pada urutan spec lain.
  const ketua = await sebagai(browser, USERS.ketua.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  const tim = (await timMilik(ketua.request)).id;
  yulId = (await anggotaTim(ketua.request, tim, periodeId))(USERS.yul.nama);
  const al = await buatAlokasi(ketua.request, { timId: tim, periodeId, judul: "PDF alokasi uji", userIds: [yulId], target: 30 });
  const yul = await sebagai(browser, USERS.yul.nip);
  const e1 = await catat(yul.request, al.penugasan[0].id, "PDF Yul disetujui", 12, "2026-10-14");
  const e2 = await catat(yul.request, al.penugasan[0].id, "PDF Yul disetujui dua", 4.5, "2026-10-13");
  await yul.tutup();
  for (const id of [e1, e2]) expect((await ketua.request.post(`/api/pekerjaan-harian/${id}/verifikasi`, { data: { aksi: "SETUJUI" } })).status()).toBe(200);
  await ketua.tutup();

  const admin = await sebagai(browser, USERS.admin.nip);
  expect((await admin.request.post("/api/rekap/generate", { data: { periodeId } })).status()).toBe(202);
  await tunggu(admin.request);
  const r = await prisma.rekapSKP.findFirstOrThrow({ where: { periodeId, userId: yulId, status: "SELESAI" }, orderBy: { versi: "desc" } });
  expect(r.filePdfKey).toMatch(/^rekap\/2026-10\/.+\/pdf\/.+\.pdf$/);
  rekapYul = r.id;
  await admin.tutup();
});

test("PDF per pegawai: header instansi, periode, identitas, tabel capaian; diunduh lewat signed URL", async ({ browser, request }) => {
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const { body, headers } = await unduh(pim.request, request, rekapYul, "pdf");
  expect(headers["content-type"]).toBe("application/pdf");
  expect(headers["content-disposition"]).toContain("attachment");
  expect(headers["content-disposition"]).toMatch(/Rekap-SKP-.*Oktober-2026-v\d+\.pdf/);
  expect(body.subarray(0, 5).toString()).toBe("%PDF-");

  const pdf = await getDocumentProxy(new Uint8Array(body));
  const { text } = await extractText(pdf, { mergePages: true });
  for (const x of ["BADAN PUSAT STATISTIK", "KABUPATEN KERINCI", "REKAP CAPAIAN KINERJA BULANAN", "Periode Oktober 2026", USERS.yul.nama, USERS.yul.nip, "Capaian per Alokasi", "Tugas Tambahan", "Total per Satuan"]) {
    expect(text, x).toContain(x);
  }
  await pim.tutup();
});

test("angka PDF konsisten dengan ringkasan_json dan XLSX untuk pegawai yang sama", async ({ browser, request }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const row = await prisma.rekapSKP.findUniqueOrThrow({ where: { id: rekapYul } });
  const j = row.ringkasanJson as unknown as RingkasanRekap;
  expect(j.alokasi.length).toBeGreaterThan(0);

  const { text } = await extractText(await getDocumentProxy(new Uint8Array((await unduh(admin.request, request, rekapYul, "pdf")).body)), { mergePages: true });
  const xl = await unduh(admin.request, request, rekapYul, "xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xl.body as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.getWorksheet(USERS.yul.nama.slice(0, 31))!;

  // Setiap alokasi: nama dan realisasi di PDF == ringkasan_json == sel XLSX.
  // Urutan baris tabel Alokasi pada XLSX sama dengan urutan ringkasan_json (judul alokasi batal diberi akhiran).
  let mulai = 0;
  ws.eachRow((r) => {
    if (!mulai && r.getCell(1).value === "Alokasi") mulai = r.number;
  });
  const barisXlsx: ExcelJS.Row[] = [];
  for (let n = mulai + 2; n <= ws.rowCount && typeof ws.getRow(n).getCell(1).value === "number"; n++) barisXlsx.push(ws.getRow(n));
  expect(barisXlsx).toHaveLength(j.alokasi.length);
  j.alokasi.forEach((a, i) => {
    const r = barisXlsx[i];
    expect(String(r.getCell(2).value), `XLSX judul #${i}`).toContain(a.judul);
    expect(Number(r.getCell(5).value), `XLSX ${a.judul}`).toBe(a.realisasi);
    expect(Number(r.getCell(4).value), `XLSX target ${a.judul}`).toBe(a.target);
    expect(text, `PDF memuat ${a.judul}`).toContain(a.judul);
  });
  for (const t of j.totalPerSatuan) {
    expect(text, `PDF total ${t.satuan}`).toContain(fmt(t.disetujui));
  }
  expect(text).toContain(`${j.hariKerja.terisi} dari ${j.hariKerja.periode} hari kerja`);
  expect(text).toContain(`${j.entri.disetujui} dari ${j.entri.total} catatan`);
  await admin.tutup();
});

test("kontrol akses PDF: ketua tim hanya untuk timnya; pegawai hanya miliknya sendiri; tanpa sesi 401", async ({ browser, request }) => {
  const url = `/api/rekap/${rekapYul}/download?format=pdf`;
  const ketua = await sebagai(browser, USERS.ketua.nip);
  expect((await ketua.request.get(url, { maxRedirects: 0 })).status(), "ketua tim A atas anggotanya").toBe(302);
  await ketua.tutup();

  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  expect((await ketua2.request.get(url, { maxRedirects: 0 })).status(), "ketua tim lain").toBe(404);
  await ketua2.tutup();

  const yul = await sebagai(browser, USERS.yul.nip);
  expect((await yul.request.get(url, { maxRedirects: 0 })).status(), "pemilik rekap").toBe(302);
  await yul.tutup();
  const rina = await sebagai(browser, USERS.rina.nip);
  expect((await rina.request.get(url, { maxRedirects: 0 })).status(), "pegawai lain").toBe(404);
  await rina.tutup();
  expect((await request.get(url, { maxRedirects: 0 })).status()).toBe(401);
});

test("rekap gagal tidak memiliki PDF; unduhan PDF-nya ditolak dengan pesan jelas", async ({ browser }) => {
  // Spec ini harus mandiri: jangan bergantung pada rekap.spec.ts (nama file "rekap-pdf"
  // diurutkan SEBELUM "rekap", jadi rekap GAGAL belum ada saat spec ini jalan).
  // Pegawai dengan NIP_GAGAL sengaja digagalkan worker uji (REKAP_GAGALKAN_NIP).
  const admin = await sebagai(browser, USERS.admin.nip);
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const tim = (await timMilik(ketua.request)).id;
  // Bersihkan sisa dari run sebelumnya (NIP unik) supaya spec ini bisa diulang.
  await prisma.rekapSKP.deleteMany({ where: { pegawai: { nip: NIP_GAGAL } } });
  await prisma.anggotaTim.deleteMany({ where: { user: { nip: NIP_GAGAL } } });
  await prisma.user.deleteMany({ where: { nip: NIP_GAGAL } });
  const gagal = await prisma.user.create({
    data: { nip: NIP_GAGAL, nama: "Pegawai Gagal Uji PDF", role: "PEGAWAI", passwordHash: await bcrypt.hash(E2E_PASSWORD, 4) },
  });
  const anggota = await prisma.anggotaTim.create({ data: { timId: tim, userId: gagal.id, periodeId } });
  try {
    const r = await admin.request.post("/api/rekap/generate", { data: { periodeId, userIds: [gagal.id] } });
    expect(r.status()).toBe(202);
    await tunggu(admin.request);

    const row = await prisma.rekapSKP.findFirstOrThrow({ where: { userId: gagal.id }, orderBy: { versi: "desc" } });
    expect(row.status, "worker uji harus gagalkan rekap ini").toBe("GAGAL");
    expect(row.errorMessage).toContain("Kegagalan disimulasikan");
    expect(row.filePdfKey, "rekap gagal tidak punya PDF").toBeNull();

    // Sudut pandang PIMPINAN: unduhan PDF ditolak dengan pesan yang jelas (bukan 500).
    const pim = await sebagai(browser, USERS.pimpinan.nip);
    const dl = await pim.request.get(`/api/rekap/${row.id}/download?format=pdf`, { maxRedirects: 0 });
    expect(dl.status()).toBe(404);
    expect((await dl.json()).pesan).toContain("belum tersedia");
    await pim.tutup();
  } finally {
    await prisma.anggotaTim.delete({ where: { id: anggota.id } });
    // RekapSKP.userId punya onDelete: Restrict — hapus baris rekap dulu, baru user-nya.
    await prisma.rekapSKP.deleteMany({ where: { userId: gagal.id } });
    await prisma.user.delete({ where: { id: gagal.id } }).catch(() => undefined);
    await admin.tutup();
    await ketua.tutup();
  }
});
