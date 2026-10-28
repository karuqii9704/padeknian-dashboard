import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { contohPng } from "../lib/testing/mini-zip";
import { FAKE_TODAY, USERS } from "./support/data";
import { anggotaTim, buatAlokasi, catat, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

let periodeId = "";
let timA = "";
let timB = "";

type Kpi = { pegawaiAktif: number; alokasiPeriodeIni: number; entriTerisiHariIni: number; pegawaiMengisiHariIni: number; entriMenungguVerifikasi: number; persenEntriBerbukti: number | null; totalEntri: number; entriBerbukti: number };
const kpi = async (request: APIRequestContext, qs = "") => {
  const r = await request.get(`/api/dashboard/ringkasan${qs}`);
  expect(r.status()).toBe(200);
  return (await r.json()) as { kpi: Kpi; periode: { id: string }; tim: { id: string; nama: string }[] };
};

/** Perhitungan manual lewat SQL mentah yang ditulis terpisah dari implementasi API. */
async function sqlManual(timIds: string[]) {
  const [peg] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT a."user_id") AS n FROM "AnggotaTim" a JOIN "User" u ON u."id" = a."user_id"
    WHERE a."periode_id" = ${periodeId}::uuid AND a."tim_id" = ANY(${timIds}::uuid[]) AND u."is_active" = true`;
  const [alo] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM "Alokasi" WHERE "periode_id" = ${periodeId}::uuid AND "tim_id" = ANY(${timIds}::uuid[]) AND "status" <> 'DIBATALKAN'`;
  const [e] = await prisma.$queryRaw<{ total: bigint; hari: bigint; peg: bigint; tunggu: bigint; bukti: bigint }[]>`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN ph."tanggal" = ${FAKE_TODAY}::date THEN 1 ELSE 0 END) AS hari,
           COUNT(DISTINCT CASE WHEN ph."tanggal" = ${FAKE_TODAY}::date THEN ph."user_id" END) AS peg,
           SUM(CASE WHEN ph."status_verifikasi" = 'MENUNGGU' THEN 1 ELSE 0 END) AS tunggu,
           (SELECT COUNT(DISTINCT b."pekerjaan_harian_id") FROM "BuktiDukung" b JOIN "PekerjaanHarian" p2 ON p2."id" = b."pekerjaan_harian_id"
             WHERE p2."periode_id" = ${periodeId}::uuid AND p2."user_id" IN (SELECT "user_id" FROM "AnggotaTim" WHERE "periode_id" = ${periodeId}::uuid AND "tim_id" = ANY(${timIds}::uuid[]))) AS bukti
    FROM "PekerjaanHarian" ph
    WHERE ph."periode_id" = ${periodeId}::uuid
      AND ph."user_id" IN (SELECT "user_id" FROM "AnggotaTim" WHERE "periode_id" = ${periodeId}::uuid AND "tim_id" = ANY(${timIds}::uuid[]))`;
  const total = Number(e.total);
  return {
    pegawaiAktif: Number(peg.n),
    alokasiPeriodeIni: Number(alo.n),
    entriTerisiHariIni: Number(e.hari ?? 0),
    pegawaiMengisiHariIni: Number(e.peg),
    entriMenungguVerifikasi: Number(e.tunggu ?? 0),
    totalEntri: total,
    entriBerbukti: Number(e.bukti),
    persenEntriBerbukti: total ? Math.round((Number(e.bukti) / total) * 1000) / 10 : null,
  };
}

test("setup: data bervariasi di dua tim (dengan/tanpa bukti, berbagai status, hari ini dan kemarin)", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  timA = (await timMilik(ketua.request)).id;
  timB = (await timMilik(ketua2.request)).id;
  const uA = await anggotaTim(ketua.request, timA, periodeId);
  const uB = await anggotaTim(ketua2.request, timB, periodeId);
  const alA = await buatAlokasi(ketua.request, { timId: timA, periodeId, judul: "KPI tim A", userIds: [uA(USERS.yul.nama), uA(USERS.rina.nama)] });
  await buatAlokasi(ketua.request, { timId: timA, periodeId, judul: "KPI tim A (dibatalkan)", userIds: [uA(USERS.yul.nama)] }).then(async (a) => {
    await ketua.request.post(`/api/alokasi/${a.id}/batalkan`, { data: { alasan: "uji kpi" } });
  });
  const alB = await buatAlokasi(ketua2.request, { timId: timB, periodeId, judul: "KPI tim B", userIds: [uB(USERS.sari.nama)] });

  const yul = await sebagai(browser, USERS.yul.nip);
  const rina = await sebagai(browser, USERS.rina.nip);
  const sari = await sebagai(browser, USERS.sari.nip);
  const pY = alA.penugasan.find((p) => p.userId === uA(USERS.yul.nama))!.id;
  const pR = alA.penugasan.find((p) => p.userId === uA(USERS.rina.nama))!.id;
  const e1 = await catat(yul.request, pY, "KPI Yul hari ini", 2, FAKE_TODAY);
  await catat(yul.request, pY, "KPI Yul kemarin", 2, "2026-10-13");
  await catat(rina.request, pR, "KPI Rina hari ini", 2, FAKE_TODAY);
  await catat(sari.request, alB.penugasan[0].id, "KPI Sari hari ini", 2, FAKE_TODAY);
  await yul.request.post(`/api/pekerjaan-harian/${e1}/bukti`, { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: contohPng() } } });
  for (const x of [ketua, ketua2, yul, rina, sari]) await x.tutup();
});

test("lima KPI cocok dengan hitungan SQL manual (selisih 0) untuk ketua A, ketua B, dan pimpinan", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const a = await kpi(ketua.request);
  expect(a.kpi).toEqual(await sqlManual([timA]));
  expect(a.kpi.persenEntriBerbukti).not.toBeNull();
  expect(a.tim.map((t) => t.id)).toEqual([timA]);
  await ketua.tutup();

  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  const b = await kpi(ketua2.request);
  expect(b.kpi).toEqual(await sqlManual([timB]));
  expect(b.kpi.entriTerisiHariIni).toBeGreaterThanOrEqual(1);
  await ketua2.tutup();

  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const semua = await kpi(pim.request);
  const tims = (await prisma.timKerja.findMany({ select: { id: true } })).map((t) => t.id);
  expect(semua.kpi).toEqual(await sqlManual(tims));
  // Filter tim oleh pimpinan = hasil tim itu saja.
  expect((await kpi(pim.request, `?timId=${timB}`)).kpi).toEqual(await sqlManual([timB]));
  // Alokasi dibatalkan tidak dihitung.
  expect(a.kpi.alokasiPeriodeIni).toBe(
    await prisma.alokasi.count({ where: { periodeId, timId: timA, status: { not: "DIBATALKAN" } } }),
  );
  await pim.tutup();
});

test("default memakai periode AKTIF; periode lain dapat dipilih; pegawai tanpa data → persen null", async ({ browser }) => {
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const def = await kpi(pim.request);
  expect(def.periode.id).toBe(periodeId);

  const lalu = await prisma.periode.findFirstOrThrow({ where: { status: "DRAFT" } });
  const kosong = await kpi(pim.request, `?periodeId=${lalu.id}`);
  expect(kosong.periode.id).toBe(lalu.id);
  expect(kosong.kpi.totalEntri).toBe(0);
  expect(kosong.kpi.persenEntriBerbukti, "tanpa entri → null, bukan 0/NaN").toBeNull();
  await pim.tutup();
});

test("kontrol akses: ketua tim lain & tim tak dikenal ditolak; pegawai/admin 403; tanpa sesi 401; parameter salah 400", async ({ browser, request }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  expect((await ketua.request.get(`/api/dashboard/ringkasan?timId=${timB}`)).status(), "ketua A melihat tim B").toBe(403);
  expect((await ketua.request.get("/api/dashboard/ringkasan?timId=bukan-uuid")).status()).toBe(400);
  await ketua.tutup();

  const pim = await sebagai(browser, USERS.pimpinan.nip);
  expect((await pim.request.get("/api/dashboard/ringkasan?timId=00000000-0000-4000-8000-000000000999")).status()).toBe(404);
  await pim.tutup();

  for (const nip of [USERS.yul.nip, USERS.admin.nip]) {
    const u = await sebagai(browser, nip);
    expect((await u.request.get("/api/dashboard/ringkasan")).status(), nip).toBe(403);
    await u.tutup();
  }
  expect((await request.get("/api/dashboard/ringkasan")).status()).toBe(401);
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("kartu ringkasan tampil sesuai API; filter tim mengubah angka; pimpinan mendarat di Dashboard", async ({ browser }) => {
    const pim = await sebagai(browser, USERS.pimpinan.nip);
    const page = pim.page;
    await expect(page).toHaveURL(/\/dashboard$/);
    const tims = (await prisma.timKerja.findMany({ select: { id: true } })).map((t) => t.id);
    const semua = await sqlManual(tims);

    const kartu = (id: string) => page.locator(`[data-kpi="${id}"]`);
    await expect(kartu("pegawai-aktif")).toContainText(String(semua.pegawaiAktif));
    await expect(kartu("alokasi")).toContainText(String(semua.alokasiPeriodeIni));
    await expect(kartu("entri-hari-ini")).toContainText(String(semua.entriTerisiHariIni));
    await expect(kartu("menunggu")).toContainText(String(semua.entriMenungguVerifikasi));
    await expect(kartu("bukti")).toContainText(String(semua.persenEntriBerbukti).replace(".", ","));
    await expect(kartu("bukti")).toContainText(`${semua.entriBerbukti} dari ${semua.totalEntri} entri`);

    await page.getByLabel("Tim kerja").selectOption({ label: "Tim Umum" });
    const b = await sqlManual([timB]);
    await expect(kartu("pegawai-aktif")).toContainText(String(b.pegawaiAktif));
    await expect(kartu("alokasi")).toContainText(String(b.alokasiPeriodeIni));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await pim.tutup();

    const ketua = await sebagai(browser, USERS.ketua.nip);
    await ketua.page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(ketua.page.getByLabel("Tim kerja").getByRole("option")).toHaveCount(2); // "Semua tim saya" + Tim A
    await ketua.tutup();
  });
});
