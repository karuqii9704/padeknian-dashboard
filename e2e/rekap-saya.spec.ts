import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { periodeAktif, sebagai } from "./support/api";
import { USERS } from "./support/data";

// Rekap Saya: pegawai melihat dan mengunduh rekap SKP miliknya sendiri, tidak milik orang lain.

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

async function tunggu(request: APIRequestContext, periodeId: string) {
  const mulai = Date.now();
  for (;;) {
    const d = await (await request.get(`/api/rekap/${periodeId}`)).json();
    if (!d.sedangBerjalan) return;
    if (Date.now() - mulai > 90_000) throw new Error("rekap tidak selesai");
    await new Promise((r) => setTimeout(r, 300));
  }
}

test("pegawai melihat ringkasan rekapnya dan mengunduh PDF miliknya; rekap orang lain tidak", async ({ browser }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const periodeId = (await periodeAktif(admin.request)).id;
  expect((await admin.request.post("/api/rekap/generate", { data: { periodeId } })).status()).toBe(202);
  await tunggu(admin.request, periodeId);
  await admin.tutup();

  const yulUser = await prisma.user.findUniqueOrThrow({ where: { nip: USERS.yul.nip } });
  const rinaUser = await prisma.user.findUniqueOrThrow({ where: { nip: USERS.rina.nip } });
  const milikYul = await prisma.rekapSKP.findFirstOrThrow({ where: { periodeId, userId: yulUser.id, status: "SELESAI" }, orderBy: { versi: "desc" } });
  const milikRina = await prisma.rekapSKP.findFirstOrThrow({ where: { periodeId, userId: rinaUser.id, status: "SELESAI" }, orderBy: { versi: "desc" } });

  const yul = await sebagai(browser, USERS.yul.nip);
  await yul.page.goto("/beranda");
  await yul.page.getByRole("link", { name: "Rekap Saya" }).first().click();
  await expect(yul.page.getByRole("heading", { level: 1, name: "Rekap Saya" })).toBeVisible();
  const kartu = yul.page.locator(`[data-rekap="${milikYul.id}"]`);
  await expect(kartu).toBeVisible();
  await expect(kartu.getByText("Hari kerja terisi")).toBeVisible();
  await expect(kartu.getByText("Capaian per alokasi")).toBeVisible();
  // Hanya rekap milik sendiri yang tampil.
  await expect(yul.page.locator(`[data-rekap="${milikRina.id}"]`)).toHaveCount(0);

  expect((await yul.request.get(`/api/rekap/${milikYul.id}/download?format=pdf`, { maxRedirects: 0 })).status()).toBe(302);
  expect((await yul.request.get(`/api/rekap/${milikRina.id}/download?format=pdf`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await yul.request.get(`/api/rekap/${milikYul.id}/download?format=xlsx`, { maxRedirects: 0 })).status()).toBe(403);
  // Halaman rekap tim tetap tertutup bagi pegawai.
  await yul.page.goto("/rekap");
  await expect(yul.page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible();
  await yul.tutup();
});

test("admin membuka Dashboard dari menu Pemantauan dan melihat grafik kepatuhan harian di beranda", async ({ browser }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const page = admin.page;
  await page.goto("/admin/pengguna");
  const grafik = page.getByRole("tabpanel").filter({ has: page.getByText("Rata-rata per hari") });
  await expect(grafik).toBeVisible();
  await expect(grafik.getByText("Di bawah 80%")).toBeVisible();
  await page.getByRole("tab", { name: "Perlu diingatkan" }).click();
  await expect(page.getByText(/pegawai dengan hari kerja terisi paling sedikit/)).toBeVisible();
  // Persentase kelengkapan tidak pernah melebihi 100%.
  const persen = (await page.locator("#panel-kelengkapan [role=meter]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("aria-valuenow")))));
  expect(persen.every((p) => p <= 100)).toBe(true);

  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.locator("[data-kpi=pegawai-aktif]")).toBeVisible();
  await admin.tutup();
});
