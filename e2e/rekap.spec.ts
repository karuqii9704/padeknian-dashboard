import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { contohPng } from "../lib/testing/mini-zip";
import { E2E_PASSWORD, NIP_GAGAL, USERS } from "./support/data";
import bcrypt from "bcryptjs";
import { anggotaTim, buatAlokasi, catat, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

let periodeId = "";
let timA = "";
let yulId = "";
let rinaId = "";
const E: Record<string, string> = {};

type Daftar = { sedangBerjalan: boolean; data: { userId: string; nama: string; jumlahVersi: number; rekap: { id: string; versi: number; status: string; errorMessage: string | null } | null }[] };
const daftar = async (request: APIRequestContext) => (await (await request.get(`/api/rekap/${periodeId}`)).json()) as Daftar;

/** Tunggu sampai tidak ada rekap QUEUED/PROSES (polling seperti UI). */
async function tungguSelesai(request: APIRequestContext, batasMs = 60_000) {
  const mulai = Date.now();
  for (;;) {
    const d = await daftar(request);
    if (!d.sedangBerjalan) return { d, ms: Date.now() - mulai };
    if (Date.now() - mulai > batasMs) throw new Error("rekap tidak selesai tepat waktu");
    await new Promise((r) => setTimeout(r, 300));
  }
}

test("setup: data capaian bervariasi untuk Yul dan Rina", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  timA = (await timMilik(ketua.request)).id;
  const u = await anggotaTim(ketua.request, timA, periodeId);
  yulId = u(USERS.yul.nama);
  rinaId = u(USERS.rina.nama);
  const al1 = await buatAlokasi(ketua.request, { timId: timA, periodeId, judul: "REKAP alokasi satu", userIds: [yulId, rinaId], target: 50 });
  const al2 = await buatAlokasi(ketua.request, { timId: timA, periodeId, judul: "REKAP alokasi dua", userIds: [yulId], target: 20 });
  const dibatalkan = await buatAlokasi(ketua.request, { timId: timA, periodeId, judul: "REKAP alokasi dibatalkan", userIds: [yulId], target: 5 });
  await ketua.request.post(`/api/alokasi/${dibatalkan.id}/batalkan`, { data: { alasan: "uji rekap" } });
  const p = (al: typeof al1, id: string) => al.penugasan.find((x) => x.userId === id)!.id;

  const yul = await sebagai(browser, USERS.yul.nip);
  E.disetujui1 = await catat(yul.request, p(al1, yulId), "REKAP Yul disetujui 1", 10, "2026-10-14");
  E.disetujui2 = await catat(yul.request, p(al1, yulId), "REKAP Yul disetujui 2", 6, "2026-10-13");
  E.menunggu = await catat(yul.request, p(al1, yulId), "REKAP Yul menunggu", 4, "2026-10-12");
  E.revisi = await catat(yul.request, p(al2, yulId), "REKAP Yul revisi", 9, "2026-10-14");
  E.tolak = await catat(yul.request, p(al2, yulId), "REKAP Yul ditolak", 7, "2026-10-13");
  await yul.request.post(`/api/pekerjaan-harian/${E.disetujui1}/bukti`, { multipart: { file: { name: "r1.png", mimeType: "image/png", buffer: contohPng() } } });
  const adhoc = await yul.request.post("/api/pekerjaan-harian", { data: { isAdHoc: true, judulAdHoc: "Rapat REKAP", tanggal: "2026-10-14", deskripsiCapaian: "REKAP ad-hoc", volume: 2, satuan: "kegiatan" } });
  E.adhoc = (await adhoc.json()).entri.id;
  const rina = await sebagai(browser, USERS.rina.nip);
  E.rina = await catat(rina.request, p(al1, rinaId), "REKAP Rina disetujui", 8, "2026-10-14");

  const v = (id: string, data: object) => ketua.request.post(`/api/pekerjaan-harian/${id}/verifikasi`, { data });
  expect((await v(E.disetujui1, { aksi: "SETUJUI" })).status()).toBe(200);
  expect((await v(E.disetujui2, { aksi: "SETUJUI" })).status()).toBe(200);
  expect((await v(E.revisi, { aksi: "MINTA_REVISI", catatan: "Perbaiki volume kegiatan." })).status()).toBe(200);
  expect((await v(E.tolak, { aksi: "TOLAK", catatan: "Bukan bagian alokasi ini." })).status()).toBe(200);
  expect((await v(E.adhoc, { aksi: "SETUJUI" })).status()).toBe(200);
  expect((await v(E.rina, { aksi: "SETUJUI" })).status()).toBe(200);
  for (const x of [ketua, yul, rina]) await x.tutup();
});

test("generate asinkron (202): status terlihat dan selesai oleh worker; ringkasan benar (hanya DISETUJUI dihitung)", async ({ browser }) => {
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const r = await pim.request.post("/api/rekap/generate", { data: { periodeId } });
  expect(r.status()).toBe(202);
  const body = await r.json();
  expect(body.jumlah).toBeGreaterThanOrEqual(4);
  const idRekap = (userId: string) => (body.rekap as { id: string; userId: string; versi: number }[]).find((x) => x.userId === userId)!;
  expect(idRekap(yulId).versi).toBeGreaterThanOrEqual(1);

  const { d, ms } = await tungguSelesai(pim.request);
  console.log(`Rekap ${body.jumlah} pegawai selesai dalam ${(ms / 1000).toFixed(1)} s`);
  expect(ms).toBeLessThanOrEqual(60_000);
  expect(d.data.every((x) => x.rekap?.status === "SELESAI")).toBe(true);

  const yul = await prisma.rekapSKP.findUniqueOrThrow({ where: { id: idRekap(yulId).id } });
  const j = yul.ringkasanJson as unknown as import("../lib/rekap-hitung").RingkasanRekap;
  expect(j.pegawai).toMatchObject({ id: yulId, nama: USERS.yul.nama });
  const al1 = j.alokasi.find((a) => a.judul === "REKAP alokasi satu")!;
  expect(al1).toMatchObject({ target: 50, realisasi: 16, menunggu: 4, persen: 32, jumlahBukti: 1 });
  expect(al1.tanggalPelaksanaan).toEqual(["2026-10-13", "2026-10-14"]);
  const al2 = j.alokasi.find((a) => a.judul === "REKAP alokasi dua")!;
  expect(al2, "revisi/tolak tidak dihitung").toMatchObject({ realisasi: 0, menunggu: 0, persen: 0 });
  expect(j.alokasi.some((a) => a.judul === "REKAP alokasi dibatalkan"), "alokasi batal tanpa capaian disembunyikan").toBe(false);
  expect(j.tugasTambahan.find((t) => t.judul === "Rapat REKAP")).toMatchObject({ satuan: "kegiatan", realisasi: 2 });
  // Pembanding dihitung langsung dari tabel entri (data pegawai yang sama dipakai spec lain, jadi bukan konstanta).
  const g = await prisma.pekerjaanHarian.groupBy({ by: ["statusVerifikasi"], where: { userId: yulId, periodeId }, _count: { _all: true } });
  const n = (st: string) => g.find((x) => x.statusVerifikasi === st)?._count._all ?? 0;
  expect(j.entri).toEqual({ disetujui: n("DISETUJUI"), menunggu: n("MENUNGGU"), mintaRevisi: n("MINTA_REVISI"), ditolak: n("DITOLAK"), total: n("DISETUJUI") + n("MENUNGGU") + n("MINTA_REVISI") + n("DITOLAK") });
  const dok = await prisma.pekerjaanHarian.findMany({ where: { userId: yulId, periodeId, satuan: "dokumen" } });
  const jml = (st: string) => dok.filter((e) => e.statusVerifikasi === st).reduce((a, e) => a + Number(e.volume), 0);
  expect(j.totalPerSatuan.find((t) => t.satuan === "dokumen")).toMatchObject({ disetujui: jml("DISETUJUI"), menunggu: jml("MENUNGGU") });
  expect(yul.finishedAt).not.toBeNull();

  const rina = await prisma.rekapSKP.findUniqueOrThrow({ where: { id: idRekap(rinaId).id } });
  const jr = rina.ringkasanJson as unknown as import("../lib/rekap-hitung").RingkasanRekap;
  expect(jr.alokasi.find((a) => a.judul === "REKAP alokasi satu")).toMatchObject({ realisasi: 8, persen: 16 });
  await pim.tutup();
});

test("generate ulang menambah versi dan tidak menimpa versi lama; generate bersamaan ditolak", async ({ browser }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const sebelum = await prisma.rekapSKP.findFirstOrThrow({ where: { periodeId, userId: yulId }, orderBy: { versi: "asc" } });
  const r1 = await admin.request.post("/api/rekap/generate", { data: { periodeId, userIds: [yulId] } });
  expect(r1.status()).toBe(202);
  // Selama berjalan, permintaan kedua ditolak.
  const r2 = await admin.request.post("/api/rekap/generate", { data: { periodeId, userIds: [yulId] } });
  expect([202, 409]).toContain(r2.status()); // bisa saja job sudah selesai sangat cepat
  await tungguSelesai(admin.request);

  const versi = await prisma.rekapSKP.findMany({ where: { periodeId, userId: yulId }, orderBy: { versi: "asc" } });
  expect(versi.length).toBeGreaterThanOrEqual(2);
  expect(versi.map((v) => v.versi)).toEqual(versi.map((_, i) => i + 1));
  const v1 = versi[0];
  expect(v1.id).toBe(sebelum.id);
  expect(JSON.stringify(v1.ringkasanJson)).toBe(JSON.stringify(sebelum.ringkasanJson));
  const d = await daftar(admin.request);
  expect(d.data.find((x) => x.userId === yulId)!.jumlahVersi).toBe(versi.length);
  expect(d.data.find((x) => x.userId === yulId)!.rekap!.versi).toBe(versi.length);
  await admin.tutup();
});

test("job gagal tersimpan sebagai GAGAL + error_message, tanpa menghentikan job lain", async ({ browser }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  // Pegawai yang sengaja digagalkan worker uji (REKAP_GAGALKAN_NIP) dimasukkan sementara ke Tim A.
  const gagal = await prisma.user.create({ data: { nip: NIP_GAGAL, nama: "Pegawai Gagal Uji", role: "PEGAWAI", passwordHash: await bcrypt.hash(E2E_PASSWORD, 4) } });
  const anggota = await prisma.anggotaTim.create({ data: { timId: timA, userId: gagal.id, periodeId } });
  try {
    const r = await admin.request.post("/api/rekap/generate", { data: { periodeId, userIds: [gagal.id, yulId, rinaId] } });
    expect(r.status()).toBe(202);
    const { d } = await tungguSelesai(admin.request);

    const g = d.data.find((x) => x.userId === gagal.id)!;
    expect(g.rekap!.status).toBe("GAGAL");
    expect(g.rekap!.errorMessage).toContain("Kegagalan disimulasikan");
    // Job lain dalam batch yang sama tetap selesai.
    expect(d.data.find((x) => x.userId === yulId)!.rekap!.status).toBe("SELESAI");
    expect(d.data.find((x) => x.userId === rinaId)!.rekap!.status).toBe("SELESAI");
    const row = await prisma.rekapSKP.findFirstOrThrow({ where: { userId: gagal.id } });
    expect(row.finishedAt).not.toBeNull();
    expect(row.ringkasanJson).toBeNull();
    expect(row.filePdfKey, "rekap gagal tidak punya PDF").toBeNull();
    const dl = await admin.request.get(`/api/rekap/${row.id}/download?format=pdf`, { maxRedirects: 0 });
    expect(dl.status()).toBe(404);
    expect((await dl.json()).pesan).toContain("belum tersedia");

    // Setelah kegagalan, generate baru untuk pegawai itu tetap bisa diantrekan (versi bertambah).
    const lagi = await admin.request.post("/api/rekap/generate", { data: { periodeId, userIds: [gagal.id] } });
    expect(lagi.status()).toBe(202);
    await tungguSelesai(admin.request);
    expect((await prisma.rekapSKP.count({ where: { userId: gagal.id } }))).toBe(2);
  } finally {
    await prisma.anggotaTim.delete({ where: { id: anggota.id } }); // jangan ganggu generate lain
  }
  await admin.tutup();
});

test("kontrol akses rekap", async ({ browser, request }) => {
  for (const nip of [USERS.yul.nip, USERS.ketua.nip]) {
    const u = await sebagai(browser, nip);
    expect((await u.request.post("/api/rekap/generate", { data: { periodeId } })).status(), nip).toBe(403);
    await u.tutup();
  }
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const d = (await (await ketua.request.get(`/api/rekap/${periodeId}`)).json()) as Daftar;
  expect(d.data.map((x) => x.nama).sort()).toEqual(expect.arrayContaining([USERS.yul.nama, USERS.rina.nama]));
  expect(d.data.some((x) => x.nama === USERS.sari.nama), "ketua A tidak melihat tim lain").toBe(false);
  await ketua.tutup();
  const yul = await sebagai(browser, USERS.yul.nip);
  expect((await yul.request.get(`/api/rekap/${periodeId}`)).status()).toBe(403);
  await yul.tutup();
  expect((await request.get(`/api/rekap/${periodeId}`)).status()).toBe(401);

  const admin = await sebagai(browser, USERS.admin.nip);
  expect((await admin.request.post("/api/rekap/generate", { data: { periodeId: "00000000-0000-4000-8000-000000000999" } })).status()).toBe(404);
  expect((await admin.request.post("/api/rekap/generate", { data: { periodeId, userIds: [(await prisma.user.findUniqueOrThrow({ where: { nip: USERS.admin.nip } })).id] } })).status(), "admin bukan anggota tim").toBe(400);
  await admin.tutup();
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("pimpinan menekan Generate: status per pegawai muncul lewat polling dan versi bertambah", async ({ browser }) => {
    const pim = await sebagai(browser, USERS.pimpinan.nip);
    const page = pim.page;
    const versiAwal = (await prisma.rekapSKP.findMany({ where: { periodeId, userId: yulId } })).length;
    const total = (await daftar(pim.request)).data.length;

    await page.goto("/rekap", { waitUntil: "networkidle" });
    const tombol = page.getByRole("button", { name: "Generate rekap" });
    expect((await tombol.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await tombol.click();

    // Tanpa muat ulang halaman, tabel diperbarui sampai semua selesai.
    await expect(page.getByText(`${total} dari ${total} pegawai selesai`)).toBeVisible({ timeout: 30_000 });
    const baris = page.locator(`[data-pegawai="${yulId}"]`);
    await expect(baris.locator("[data-status]")).toHaveText("Selesai");
    await expect(baris).toContainText(`v${versiAwal + 1}`);
    await expect(page.getByRole("button", { name: "Generate rekap" })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await pim.tutup();

    // Ketua tim melihat rekap timnya tetapi tidak punya tombol Generate.
    const ketua = await sebagai(browser, USERS.ketua.nip);
    await ketua.page.goto("/rekap", { waitUntil: "networkidle" });
    await expect(ketua.page.getByRole("button", { name: "Generate rekap" })).toHaveCount(0);
    await expect(ketua.page.locator(`[data-pegawai="${yulId}"]`)).toBeVisible();
    await ketua.tutup();
  });
});
