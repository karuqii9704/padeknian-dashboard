import { expect, test } from "@playwright/test";
import { sebagai, timMilik } from "./support/api";
import { E2E_PASSWORD, USERS } from "./support/data";

// Fitur per peran: Tim Saya (pegawai & ketua; ketua mengatur anggota timnya), Admin membaca audit log, pencarian tabel dashboard/rekap.

test("ketua tim mengatur anggota timnya sendiri dari menu Tim Saya", async ({ browser }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const nip = `19980${Date.now()}`;
  const buat = await admin.request.post("/api/pengguna", { data: { nip, nama: `Calon Anggota ${nip.slice(-4)}`, role: "PEGAWAI", password: E2E_PASSWORD } });
  expect(buat.status()).toBe(201);
  const calon = (await buat.json()).user as { id: string; nama: string };

  const ketua = await sebagai(browser, USERS.ketua.nip);
  const page = ketua.page;
  page.on("dialog", (d) => d.accept());
  const tim = await timMilik(ketua.request);

  await page.goto("/beranda");
  await page.getByRole("link", { name: "Tim Saya" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Tim Saya" })).toBeVisible();
  const panel = page.getByRole("region", { name: `Anggota ${(tim as unknown as { nama: string }).nama}` });

  await panel.getByLabel("Tambah anggota").selectOption(calon.id);
  await panel.getByRole("button", { name: "Tambah" }).click();
  await expect(panel.getByRole("status")).toContainText("ditambahkan");
  await expect(panel.locator(`[data-anggota="${calon.id}"]`)).toBeVisible();
  // Ketua ditandai teks + warna; baris ketua adalah akun yang sedang login ("Anda").
  await expect(panel.getByText("Anda ketua tim ini")).toBeVisible();
  const barisKetua = panel.locator("[data-ketua]");
  await expect(barisKetua).toHaveCount(1);
  await expect(barisKetua).toContainText("Ketua tim");
  await expect(barisKetua).toContainText("Anda");

  await panel.getByRole("button", { name: `Hapus ${calon.nama} dari anggota tim` }).click();
  await expect(panel.getByRole("status")).toContainText("dikeluarkan");
  await expect(panel.locator(`[data-anggota="${calon.id}"]`)).toHaveCount(0);

  await admin.request.patch(`/api/pengguna/${calon.id}`, { data: { isActive: false } });
  await ketua.tutup();
  await admin.tutup();
});

test("pegawai melihat timnya (baca saja) dengan ketua ditandai; pimpinan ditolak; ketua lain tidak dapat mengubah tim orang lain", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const yulId = (await (await yul.request.get("/api/me")).json()).user.id as string;
  await yul.page.goto("/beranda");
  await yul.page.getByRole("link", { name: "Tim Saya" }).first().click();
  await expect(yul.page.getByRole("heading", { level: 1, name: "Tim Saya" })).toBeVisible();
  const kartu = yul.page.getByRole("region", { name: /^Anggota / }).first();
  await expect(kartu.getByText("Anda anggota")).toBeVisible();
  await expect(kartu.locator("[data-ketua]")).toContainText("Ketua tim");
  await expect(kartu.locator(`[data-anggota="${yulId}"]`)).toContainText("Anda");
  await expect(yul.page.getByLabel("Tambah anggota")).toHaveCount(0);
  await expect(yul.page.getByRole("button", { name: /^Hapus / })).toHaveCount(0);
  await yul.tutup();

  const pimpinan = await sebagai(browser, USERS.pimpinan.nip);
  await pimpinan.page.goto("/tim-saya");
  await expect(pimpinan.page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible();
  await pimpinan.tutup();

  const ketua = await sebagai(browser, USERS.ketua.nip);
  const tim = await timMilik(ketua.request);
  await ketua.tutup();
  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  const periode = ((await (await ketua2.request.get("/api/periode")).json()).data as { id: string; status: string }[]).find((p) => p.status === "AKTIF")!;
  const r = await ketua2.request.post(`/api/tim/${tim.id}/anggota`, { data: { periodeId: periode.id, hapus: [tim.ketua.id] } });
  expect(r.status()).toBe(403);
  await ketua2.tutup();
});

test("admin membaca audit log dengan filter aksi; peran lain ditolak", async ({ browser }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  await admin.page.goto("/admin/audit-log");
  await expect(admin.page.getByRole("heading", { level: 1, name: "Audit Log" })).toBeVisible();
  await expect(admin.page.locator("[data-audit]").first()).toBeVisible();

  await admin.page.getByLabel("Aksi").selectOption("LOGIN");
  await admin.page.getByRole("button", { name: "Terapkan" }).click();
  await admin.page.waitForURL(/aksi=LOGIN/);
  const aksi = await admin.page.locator("[data-audit] td:nth-child(3)").allInnerTexts();
  expect(aksi.length).toBeGreaterThan(0);
  expect(aksi.every((a) => a.trim() === "Login")).toBe(true);

  const api = await admin.request.get(`/api/audit-log?aksi=LOGIN&q=${USERS.admin.nip}&pageSize=5`);
  expect(api.status()).toBe(200);
  const body = await api.json();
  expect(body.data.length).toBeGreaterThan(0);
  expect(body.data.every((l: { aksi: string; user: { nip: string } }) => l.aksi === "LOGIN" && l.user.nip === USERS.admin.nip)).toBe(true);
  expect((await admin.request.get("/api/audit-log?dari=2026-10-10&sampai=2026-10-01")).status()).toBe(400);
  await admin.tutup();

  const pimpinan = await sebagai(browser, USERS.pimpinan.nip);
  expect((await pimpinan.request.get("/api/audit-log")).status()).toBe(403);
  await pimpinan.page.goto("/admin/audit-log");
  await expect(pimpinan.page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible();
  await pimpinan.tutup();
});

test("pencarian tabel ringkasan pegawai di dashboard pimpinan", async ({ browser }) => {
  const pimpinan = await sebagai(browser, USERS.pimpinan.nip);
  const page = pimpinan.page;
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.getByLabel("Cari pegawai atau tim").fill(USERS.yul.nama);
  const baris = page.locator("[data-pegawai]");
  await expect(baris).toHaveCount(1);
  await expect(baris.first()).toContainText(USERS.yul.nama);
  await page.getByLabel("Cari pegawai atau tim").fill("zzz-tidak-ada");
  await expect(page.getByText(/Tidak ada pegawai yang cocok/)).toBeVisible();
  await pimpinan.tutup();
});

test("halaman di luar peran mengembalikan HTTP 403 dengan halaman Akses ditolak di dalam kerangka aplikasi", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  for (const url of ["/dashboard", "/verifikasi", "/rekap", "/admin/pengguna", "/admin/audit-log"]) {
    const res = await yul.page.goto(url);
    expect(res?.status(), url).toBe(403);
    await expect(yul.page.getByRole("heading", { level: 1, name: "Akses ditolak" }), url).toBeVisible();
  }
  // Tetap di dalam kerangka aplikasi (menu masih ada) dan menawarkan jalan keluar.
  await expect(yul.page.getByRole("link", { name: "Hari Ini" }).first()).toBeVisible();
  await expect(yul.page.getByRole("link", { name: "Ke halaman awal" })).toBeVisible();
  expect((await yul.page.goto("/hari-ini"))?.status()).toBe(200);
  await yul.tutup();
});
