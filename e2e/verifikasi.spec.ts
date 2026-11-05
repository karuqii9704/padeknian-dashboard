import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { contohPng } from "../lib/testing/mini-zip";
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

const E: Record<string, string> = {}; // id entri per kunci
let periodeId = "";

const jamLalu = (jam: number) => new Date(Date.now() - jam * 3600_000);

async function buatAlokasi(request: APIRequestContext, timId: string, judul: string, userIds: string[]) {
  const r = await request.post("/api/alokasi", {
    data: {
      timId,
      periodeId,
      judul,
      deskripsi: "uji verifikasi",
      tanggalMulai: "2026-10-01",
      tanggalSelesai: "2026-10-30",
      targetVolume: 100,
      satuan: "dokumen",
      prioritas: "SEDANG",
      penugasan: userIds.map((userId) => ({ userId })),
    },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).alokasi.penugasan as { id: string; userId: string }[];
}
async function catat(request: APIRequestContext, penugasanId: string, deskripsi: string) {
  const r = await request.post("/api/pekerjaan-harian", { data: { penugasanId, tanggal: "2026-10-14", deskripsiCapaian: deskripsi, volume: 3 } });
  expect(r.status()).toBe(201);
  return (await r.json()).entri.id as string;
}

test("setup: dua tim, entri berbagai status dengan waktu tunggu berbeda", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  const tims = (await (await ketua.request.get("/api/tim")).json()).data as { id: string; ketua: { id: string } }[];
  const periode = ((await (await ketua.request.get("/api/periode")).json()).data as { id: string; status: string }[]).find((p) => p.status === "AKTIF")!;
  periodeId = periode.id;
  const idUser = async (req: APIRequestContext, timId: string) => {
    const a = (await (await req.get(`/api/tim/${timId}/anggota?periodeId=${periodeId}`)).json()).anggota as { userId: string; nama: string }[];
    return (nama: string) => a.find((x) => x.nama === nama)!.userId;
  };
  const profilKetua = await (await ketua.request.get("/api/me")).json();
  const profilKetua2 = await (await ketua2.request.get("/api/me")).json();
  const tA = tims.find((t) => t.ketua.id === profilKetua.user.id)!;
  const tB = tims.find((t) => t.ketua.id === profilKetua2.user.id)!;
  const uA = await idUser(ketua.request, tA.id);
  const uB = await idUser(ketua2.request, tB.id);

  const penA = await buatAlokasi(ketua.request, tA.id, "Verifikasi Tim A", [uA(USERS.yul.nama), uA(USERS.rina.nama), uA(USERS.ketua.nama)]);
  const penB = await buatAlokasi(ketua2.request, tB.id, "Verifikasi Tim B", [uB(USERS.sari.nama)]);
  const p = (arr: { id: string; userId: string }[], userId: string) => arr.find((x) => x.userId === userId)!.id;

  const yul = await sebagai(browser, USERS.yul.nip);
  E.yul = await catat(yul.request, p(penA, uA(USERS.yul.nama)), "VERIF entri Yul tertua");
  await yul.request.post(`/api/pekerjaan-harian/${E.yul}/bukti`, { multipart: { file: { name: "bukti-yul.png", mimeType: "image/png", buffer: contohPng() } } });
  E.yulDisetujui = await catat(yul.request, p(penA, uA(USERS.yul.nama)), "VERIF entri Yul sudah disetujui");
  E.yulRevisi = await catat(yul.request, p(penA, uA(USERS.yul.nama)), "VERIF entri Yul minta revisi");
  await yul.tutup();
  const rina = await sebagai(browser, USERS.rina.nip);
  E.rina = await catat(rina.request, p(penA, uA(USERS.rina.nama)), "VERIF entri Rina lebih baru");
  await rina.tutup();
  E.ketuaSendiri = await catat(ketua.request, p(penA, uA(USERS.ketua.nama)), "VERIF entri ketua sendiri");
  const sari = await sebagai(browser, USERS.sari.nip);
  E.sari = await catat(sari.request, p(penB, uB(USERS.sari.nama)), "VERIF entri Sari tim lain");
  await sari.tutup();

  // Waktu tunggu deterministik: Yul 72 jam, Rina 24 jam.
  await prisma.pekerjaanHarian.update({ where: { id: E.yul }, data: { updatedAt: jamLalu(72) } });
  await prisma.pekerjaanHarian.update({ where: { id: E.rina }, data: { updatedAt: jamLalu(24) } });
  await prisma.pekerjaanHarian.update({ where: { id: E.yulDisetujui }, data: { statusVerifikasi: "DISETUJUI" } });
  await prisma.pekerjaanHarian.update({ where: { id: E.yulRevisi }, data: { statusVerifikasi: "MINTA_REVISI" } });
  await ketua.tutup();
  await ketua2.tutup();
});

test("antrean ketua: hanya MENUNGGU anggota timnya, urut paling lama dulu; tanpa entri sendiri/tim lain", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const res = await ketua.request.get("/api/verifikasi/antrean?pageSize=100");
  expect(res.status()).toBe(200);
  const body = await res.json();
  const ids = (body.data as { id: string }[]).map((x) => x.id);

  expect(ids).toContain(E.yul);
  expect(ids).toContain(E.rina);
  expect(ids).not.toContain(E.sari); // tim lain
  expect(ids).not.toContain(E.ketuaSendiri); // tanpa verifikasi mandiri
  expect(ids).not.toContain(E.yulDisetujui);
  expect(ids).not.toContain(E.yulRevisi);
  expect(ids.indexOf(E.yul), "paling lama menunggu di atas").toBeLessThan(ids.indexOf(E.rina));
  expect(body.total).toBe(ids.length);

  // Terurut menaik berdasarkan waktu diajukan untuk seluruh daftar.
  const waktu = (body.data as { diajukanSejak: string }[]).map((x) => new Date(x.diajukanSejak).getTime());
  expect([...waktu].sort((a, b) => a - b)).toEqual(waktu);

  // Bukti ikut dimuat untuk pratinjau, tanpa object key.
  const yul = (body.data as { id: string; bukti: { namaAsli: string; tautan: string }[] }[]).find((x) => x.id === E.yul)!;
  expect(yul.bukti[0].namaAsli).toBe("bukti-yul.png");
  expect(yul.bukti[0].tautan).toMatch(/^\/api\/bukti\//);
  expect(JSON.stringify(body)).not.toContain("objectKey");
  await ketua.tutup();

  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  const ids2 = ((await (await ketua2.request.get("/api/verifikasi/antrean?pageSize=100")).json()).data as { id: string }[]).map((x) => x.id);
  expect(ids2).toContain(E.sari);
  expect(ids2).not.toContain(E.yul);
  await ketua2.tutup();
});

test("antrean hanya untuk KETUA_TIM (pegawai, pimpinan → 403; tanpa sesi → 401)", async ({ browser, request }) => {
  for (const nip of [USERS.yul.nip, USERS.pimpinan.nip, USERS.admin.nip]) {
    const u = await sebagai(browser, nip);
    expect((await u.request.get("/api/verifikasi/antrean")).status(), nip).toBe(403);
    await u.tutup();
  }
  expect((await request.get("/api/verifikasi/antrean")).status()).toBe(401);
});

test("riwayat append-only: PATCH/PUT/DELETE → 405; UPDATE/DELETE/TRUNCATE di DB ditolak; catatan pendek ditolak DB", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const verifikator = await prisma.user.findUniqueOrThrow({ where: { nip: USERS.ketua.nip } });
  const v = await prisma.verifikasi.create({
    data: { pekerjaanHarianId: E.yulRevisi, verifikatorId: verifikator.id, aksi: "MINTA_REVISI", catatan: "Lampirkan foto kegiatan lapangan." },
  });

  expect((await ketua.request.get(`/api/verifikasi/${v.id}`)).status()).toBe(200);
  for (const m of ["patch", "put", "delete"] as const) {
    const r = await ketua.request[m](`/api/verifikasi/${v.id}`, m === "delete" ? undefined : { data: { catatan: "ubah" } });
    expect([403, 405], `${m} harus ditolak`).toContain(r.status());
  }

  await expect(prisma.$executeRawUnsafe(`UPDATE "Verifikasi" SET catatan = 'x' WHERE id = '${v.id}'`)).rejects.toThrow(/append-only/);
  await expect(prisma.$executeRawUnsafe(`DELETE FROM "Verifikasi" WHERE id = '${v.id}'`)).rejects.toThrow(/append-only/);
  await expect(prisma.$executeRawUnsafe(`TRUNCATE "Verifikasi"`)).rejects.toThrow(/append-only/);
  await expect(
    prisma.verifikasi.create({ data: { pekerjaanHarianId: E.yulRevisi, verifikatorId: verifikator.id, aksi: "TOLAK", catatan: "pendek" } }),
  ).rejects.toThrow();

  // Baris tetap utuh; detail entri memuat riwayat berikut verifikator & waktu.
  expect((await prisma.verifikasi.findUniqueOrThrow({ where: { id: v.id } })).catatan).toBe("Lampirkan foto kegiatan lapangan.");
  const det = await (await ketua.request.get(`/api/pekerjaan-harian/${E.yulRevisi}`)).json();
  expect(det.entri.verifikasi).toHaveLength(1);
  expect(det.entri.verifikasi[0]).toMatchObject({ aksi: "MINTA_REVISI", verifikator: { nama: USERS.ketua.nama } });
  expect(det.entri.verifikasi[0].createdAt).toBeTruthy();
  await ketua.tutup();
});

test("entri yang pernah diverifikasi tidak bisa dihapus pemiliknya", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const r = await yul.request.delete(`/api/pekerjaan-harian/${E.yulRevisi}`);
  expect(r.status()).toBe(409);
  expect((await r.json()).pesan).toContain("sudah pernah diverifikasi");
  await yul.tutup();
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("halaman Verifikasi menampilkan antrean berurutan dengan bukti inline & badge di navigasi", async ({ browser }) => {
    const ketua = await sebagai(browser, USERS.ketua.nip);
    const page = ketua.page;
    await page.goto("/verifikasi", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Verifikasi", exact: true })).toBeVisible();

    const kartuYul = page.locator(`[data-entri="${E.yul}"]`);
    const kartuRina = page.locator(`[data-entri="${E.rina}"]`);
    await expect(kartuYul).toBeVisible();
    await expect(kartuYul.getByText("Menunggu 3 hari")).toBeVisible();
    await expect(kartuRina.getByText("Menunggu 1 hari")).toBeVisible();
    await expect(kartuYul.getByAltText("bukti-yul.png")).toBeVisible();
    await expect(kartuYul.getByText("Ada bukti")).toBeVisible();
    await expect(kartuRina.getByText("Belum ada bukti")).toBeVisible();
    await expect(page.locator(`[data-entri="${E.sari}"]`)).toHaveCount(0);

    const urutan = await page.locator("[data-entri]").evaluateAll((els) => els.map((e) => e.getAttribute("data-entri")));
    expect(urutan.indexOf(E.yul)).toBeLessThan(urutan.indexOf(E.rina));

    const badge = page.getByRole("navigation", { name: "Menu utama" }).getByRole("link", { name: /Verifikasi/ }).getByLabel(/menunggu verifikasi/);
    await expect(badge).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await ketua.tutup();
  });

  test("pegawai tidak melihat menu/halaman Verifikasi", async ({ browser }) => {
    const yul = await sebagai(browser, USERS.yul.nip);
    const res = await yul.page.goto("/verifikasi", { waitUntil: "networkidle" });
    expect(res?.status()).toBe(403);
    await expect(yul.page.getByRole("heading", { level: 1, name: "Akses ditolak" })).toBeVisible();
    await expect(yul.page.getByRole("navigation", { name: "Menu utama" }).getByRole("link", { name: /Verifikasi/ })).toHaveCount(0);
    await yul.tutup();
  });
});
