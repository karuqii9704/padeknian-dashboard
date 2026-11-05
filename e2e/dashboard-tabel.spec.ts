import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { contohPng } from "../lib/testing/mini-zip";
import { USERS } from "./support/data";
import { anggotaTim, buatAlokasi, catat, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

let periodeId = "";
let timA = "";
let timB = "";
let yulId = "";
let rinaId = "";
const E: Record<string, string> = {};

type Baris = {
  userId: string; nama: string; tim: string[]; jumlahEntri: number;
  volumePerSatuan: { satuan: string; total: number; disetujui: number }[];
  hariTerisi: number; persenHariTerisi: number | null; entriMenunggu: number;
  verifikasiTerakhir: { aksi: string; waktu: string } | null;
};
const tabel = async (request: APIRequestContext, qs = "") => {
  const r = await request.get(`/api/dashboard/pegawai${qs}`);
  expect(r.status()).toBe(200);
  return (await r.json()) as { hariKerja: { periode: number; berlalu: number }; data: Baris[] };
};

/** Nilai harapan dihitung ulang di JS dari baris mentah (berbeda dari agregasi SQL pada implementasi). */
async function harapan(userId: string) {
  const rows = await prisma.pekerjaanHarian.findMany({ where: { userId, periodeId }, include: { verifikasi: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const perSatuan = new Map<string, { total: number; disetujui: number }>();
  for (const r of rows) {
    const x = perSatuan.get(r.satuan) ?? { total: 0, disetujui: 0 };
    x.total += Number(r.volume);
    if (r.statusVerifikasi === "DISETUJUI") x.disetujui += Number(r.volume);
    perSatuan.set(r.satuan, x);
  }
  const terakhir = rows.flatMap((r) => r.verifikasi).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return {
    jumlahEntri: rows.length,
    hariTerisi: new Set(rows.map((r) => r.tanggal.toISOString().slice(0, 10))).size,
    entriMenunggu: rows.filter((r) => r.statusVerifikasi === "MENUNGGU").length,
    volume: [...perSatuan.entries()].map(([satuan, v]) => ({ satuan, ...v })).sort((a, b) => a.satuan.localeCompare(b.satuan)),
    aksiTerakhir: terakhir?.aksi ?? null,
  };
}

test("setup: Yul (3 hari, 2 satuan, ada bukti & verifikasi) dan Rina (1 hari)", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  timA = (await timMilik(ketua.request)).id;
  timB = (await timMilik(ketua2.request)).id;
  const u = await anggotaTim(ketua.request, timA, periodeId);
  yulId = u(USERS.yul.nama);
  rinaId = u(USERS.rina.nama);
  const al = await buatAlokasi(ketua.request, { timId: timA, periodeId, judul: "Uji tabel dashboard", userIds: [yulId, rinaId] });
  const pY = al.penugasan.find((p) => p.userId === yulId)!.id;
  const pR = al.penugasan.find((p) => p.userId === rinaId)!.id;

  const yul = await sebagai(browser, USERS.yul.nip);
  const rina = await sebagai(browser, USERS.rina.nip);
  E.y1 = await catat(yul.request, pY, "TABEL Yul hari 14", 4, "2026-10-14");
  E.y2 = await catat(yul.request, pY, "TABEL Yul hari 13", 6, "2026-10-13");
  E.y3 = await catat(yul.request, pY, "TABEL Yul hari 12", 2, "2026-10-12");
  const adhoc = await yul.request.post("/api/pekerjaan-harian", { data: { isAdHoc: true, judulAdHoc: "Rapat TABEL", tanggal: "2026-10-14", deskripsiCapaian: "TABEL ad-hoc", volume: 1, satuan: "kegiatan" } });
  E.y4 = (await adhoc.json()).entri.id;
  await yul.request.post(`/api/pekerjaan-harian/${E.y1}/bukti`, { multipart: { file: { name: "tabel.png", mimeType: "image/png", buffer: contohPng() } } });
  await catat(rina.request, pR, "TABEL Rina", 5, "2026-10-14");
  expect((await ketua.request.post(`/api/pekerjaan-harian/${E.y2}/verifikasi`, { data: { aksi: "SETUJUI" } })).status()).toBe(200);
  expect((await ketua.request.post(`/api/pekerjaan-harian/${E.y3}/verifikasi`, { data: { aksi: "MINTA_REVISI", catatan: "Tambahkan keterangan." } })).status()).toBe(200);
  for (const x of [ketua, ketua2, yul, rina]) await x.tutup();
});

test("tabel memuat kolom FR-38 dan angkanya cocok dengan hitungan independen", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const t = await tabel(ketua.request);
  // Oktober 2026: 22 hari kerja dikurangi libur uji 8 Okt = 21; berlalu sampai 14 Okt = 9.
  expect(t.hariKerja).toEqual({ periode: 21, berlalu: 9 });

  for (const id of [yulId, rinaId]) {
    const baris = t.data.find((x) => x.userId === id)!;
    const h = await harapan(id);
    expect(baris.jumlahEntri).toBe(h.jumlahEntri);
    expect(baris.hariTerisi).toBe(h.hariTerisi);
    expect(baris.entriMenunggu).toBe(h.entriMenunggu);
    expect(baris.volumePerSatuan).toEqual(h.volume);
    expect(baris.verifikasiTerakhir?.aksi ?? null).toBe(h.aksiTerakhir);
    expect(baris.persenHariTerisi).toBe(Math.round((h.hariTerisi / 9) * 1000) / 10);
    expect(baris.tim).toContain("Tim Statistik Produksi");
  }
  const yul = t.data.find((x) => x.userId === yulId)!;
  expect(yul.volumePerSatuan.map((v) => v.satuan)).toEqual(expect.arrayContaining(["dokumen", "kegiatan"]));
  expect(yul.verifikasiTerakhir).not.toBeNull();
  expect(t.data.every((x, i, a) => i === 0 || a[i - 1].nama.localeCompare(x.nama) <= 0)).toBe(true);
  await ketua.tutup();
});

test("filter tim/pegawai/periode; pagar akses lintas tim", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const satu = await tabel(ketua.request, `?userId=${yulId}`);
  expect(satu.data.map((x) => x.userId)).toEqual([yulId]);
  expect((await ketua.request.get(`/api/dashboard/pegawai?timId=${timB}`)).status()).toBe(403);
  const sari = await prisma.user.findUniqueOrThrow({ where: { nip: USERS.sari.nip } });
  expect((await ketua.request.get(`/api/dashboard/pegawai?userId=${sari.id}`)).status(), "pegawai tim lain").toBe(404);
  await ketua.tutup();

  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  const b = await tabel(ketua2.request);
  expect(b.data.map((x) => x.nama).sort()).toEqual([USERS.ketua2.nama, USERS.sari.nama].sort());
  expect(b.data.some((x) => x.userId === yulId)).toBe(false);
  await ketua2.tutup();

  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const semua = await tabel(pim.request);
  expect(semua.data.some((x) => x.userId === yulId) && semua.data.some((x) => x.nama === USERS.sari.nama)).toBe(true);
  expect((await tabel(pim.request, `?timId=${timB}`)).data.length).toBe(2);
  const lalu = await prisma.periode.findFirstOrThrow({ where: { status: "DRAFT" } });
  // Periode lain: Yul anggota tim itu (0 entri); Rina bukan anggota periode itu → 404.
  const periodeLalu = await tabel(pim.request, `?periodeId=${lalu.id}&userId=${yulId}`);
  expect(periodeLalu.data).toHaveLength(1);
  expect(periodeLalu.data[0]).toMatchObject({ jumlahEntri: 0, hariTerisi: 0, entriMenunggu: 0, volumePerSatuan: [] });
  expect((await pim.request.get(`/api/dashboard/pegawai?periodeId=${lalu.id}&userId=${rinaId}`)).status()).toBe(404);
  await pim.tutup();

  const yulSesi = await sebagai(browser, USERS.yul.nip);
  expect((await yulSesi.request.get("/api/dashboard/pegawai")).status(), "pegawai").toBe(403);
  await yulSesi.tutup();
  // Admin ikut memantau seluruh tim (sama seperti pimpinan).
  const adminSesi = await sebagai(browser, USERS.admin.nip);
  expect((await adminSesi.request.get("/api/dashboard/pegawai")).status(), "admin").toBe(200);
  await adminSesi.tutup();
});

test("drill-down: entri harian pegawai lengkap dengan bukti & riwayat; hanya yang berwenang", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const r = await ketua.request.get(`/api/dashboard/pegawai/${yulId}`);
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.pegawai.id).toBe(yulId);
  const ids = (body.data as { id: string }[]).map((e) => e.id);
  const dbIds = (await prisma.pekerjaanHarian.findMany({ where: { userId: yulId, periodeId } })).map((e) => e.id);
  expect(new Set(ids)).toEqual(new Set(dbIds));
  const dgBukti = (body.data as { id: string; bukti: { namaAsli: string; tautan: string }[]; jumlahBukti: number }[]).find((e) => e.id === E.y1)!;
  expect(dgBukti.jumlahBukti).toBe(1);
  expect(dgBukti.bukti[0]).toMatchObject({ namaAsli: "tabel.png" });
  expect(dgBukti.bukti[0].tautan).toMatch(/^\/api\/bukti\//);
  const direvisi = (body.data as { id: string; verifikasi: { aksi: string; catatan: string }[] }[]).find((e) => e.id === E.y3)!;
  expect(direvisi.verifikasi[0]).toMatchObject({ aksi: "MINTA_REVISI", catatan: "Tambahkan keterangan." });
  expect(JSON.stringify(body)).not.toContain("objectKey");
  // Terurut tanggal turun.
  const tgl = (body.data as { tanggal: string }[]).map((e) => e.tanggal);
  expect([...tgl].sort().reverse()).toEqual(tgl);

  // Pratinjau bukti dari drill-down dapat diunduh pimpinan/ketua lewat tautan (signed URL).
  const unduh = await ketua.request.get(dgBukti.bukti[0].tautan, { maxRedirects: 0 });
  expect(unduh.status()).toBe(302);
  await ketua.tutup();

  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  expect((await ketua2.request.get(`/api/dashboard/pegawai/${yulId}`)).status(), "ketua tim lain").toBe(404);
  await ketua2.tutup();
  const yul = await sebagai(browser, USERS.yul.nip);
  expect((await yul.request.get(`/api/dashboard/pegawai/${yulId}`)).status()).toBe(403);
  await yul.tutup();
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  expect((await pim.request.get(`/api/dashboard/pegawai/${yulId}`)).status()).toBe(200);
  expect((await pim.request.get("/api/dashboard/pegawai/bukan-uuid")).status()).toBe(404);
  await pim.tutup();
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("tabel tampil; filter tanpa muat ulang halaman; klik baris membuka rincian dengan bukti inline", async ({ browser }) => {
    const pim = await sebagai(browser, USERS.pimpinan.nip);
    const page = pim.page;
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("columnheader", { name: "Pegawai" })).toBeVisible();
    for (const kolom of ["Entri", "Volume", "Hari terisi", "Belum diverifikasi", "Verifikasi terakhir"]) {
      await expect(page.getByRole("columnheader", { name: kolom })).toBeVisible();
    }
    const baris = page.locator(`[data-pegawai="${yulId}"]`);
    await expect(baris).toBeVisible();
    const h = await harapan(yulId);
    await expect(baris.getByRole("cell").first()).toHaveText(String(h.jumlahEntri));
    await expect(baris).toContainText(`${h.hariTerisi}/9`);

    // Filter tanpa muat ulang halaman penuh.
    await page.evaluate(() => ((window as unknown as { __tanda: number }).__tanda = 1));
    await page.getByLabel("Tim kerja", { exact: true }).selectOption({ label: "Tim Umum" });
    await expect(page.locator(`[data-pegawai="${yulId}"]`)).toHaveCount(0);
    await expect(page.locator("[data-pegawai]").filter({ hasText: USERS.sari.nama })).toBeVisible();
    await page.getByLabel("Tim kerja", { exact: true }).selectOption({ label: "Semua tim" });
    await page.getByLabel("Pegawai", { exact: true }).selectOption({ label: USERS.yul.nama });
    await expect(page.locator("[data-pegawai]")).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { __tanda?: number }).__tanda), "tidak ada reload").toBe(1);
    await page.getByLabel("Pegawai", { exact: true }).selectOption({ label: "Semua pegawai" });

    // Rincian + pratinjau bukti inline.
    await page.getByRole("button", { name: `Lihat rincian ${USERS.yul.nama}` }).click();
    const dlg = page.getByRole("dialog", { name: "Rincian entri pegawai" });
    await expect(dlg.getByRole("heading", { name: USERS.yul.nama })).toBeVisible();
    const kartu = dlg.locator(`[data-entri="${E.y1}"]`);
    await expect(kartu.getByText("TABEL Yul hari 14")).toBeVisible();
    await expect(kartu.getByAltText("tabel.png")).toBeVisible();
    await expect(dlg.locator(`[data-entri="${E.y3}"]`).getByText("Perlu revisi")).toBeVisible();
    await dlg.getByRole("button", { name: "Tutup" }).first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await pim.tutup();
  });
});
