import { expect, test, type Browser, type Page } from "@playwright/test";
import { contohPng } from "../lib/testing/mini-zip";
import { USERS } from "./support/data";
import { loginUI } from "./support/auth";

// Semua pengujian UI di sini memakai layar HP 360px. Hari ini (E2E) = Rabu 14 Okt 2026.
const VIEWPORT = { width: 360, height: 800 };
test.use({ viewport: VIEWPORT });
test.describe.configure({ mode: "serial" });

async function masuk(browser: Browser, nip: string) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await loginUI(page, nip);
  await page.waitForURL("**/beranda");
  return { page, tutup: () => ctx.close() };
}

const tanpaScrollHorizontal = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "tanpa scroll horizontal").toBeLessThanOrEqual(VIEWPORT.width);

const judulEvent = `Pelatihan UI Yul ${Date.now()}`;

test("Beranda pegawai: sapaan, status, aksi cepat, ringkasan, dan menu bawah; tanpa scroll horizontal", async ({ browser }) => {
  const { page, tutup } = await masuk(browser, USERS.yul.nip);

  await expect(page.getByRole("heading", { level: 1, name: /^Selamat (pagi|siang|sore|malam), Yul$/ })).toBeVisible();
  await expect(page.getByText("Rabu, 14 Okt 2026").first()).toBeVisible(); // eyebrow; tanggal yang sama juga muncul di aktivitas

  const aksi = page.getByRole("region", { name: "Aksi cepat" });
  for (const nama of [/Catat pekerjaan hari ini/, /Lapor event/, /Lihat revisi/, /Kalender/]) {
    await expect(aksi.getByRole("link", { name: nama })).toBeVisible();
  }
  await expect(aksi.getByRole("link", { name: /Verifikasi/ })).toHaveCount(0); // khusus ketua tim

  const ringkasan = page.getByRole("region", { name: "Ringkasan" });
  await expect(ringkasan.getByText("Catatan hari ini")).toBeVisible();
  await expect(ringkasan.getByText("Perlu revisi")).toBeVisible();
  await expect(ringkasan.getByText("Alokasi berjalan")).toBeVisible();
  await expect(ringkasan.getByText("Menunggu verifikasi")).toHaveCount(0);

  // Angka "Catatan hari ini" mengikuti API.
  const api = await (await page.request.get("/api/hari-ini")).json();
  await expect(ringkasan.getByRole("link", { name: /Catatan hari ini/ })).toContainText(String(api.jumlahEntriHariIni));

  // Menu bawah di HP memuat Beranda dan Event.
  const nav = page.getByRole("navigation", { name: "Menu utama" });
  await expect(nav.getByRole("link", { name: "Beranda" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Event" })).toBeVisible();
  await tanpaScrollHorizontal(page);
  await tutup();
});

test("Beranda ketua tim: aksi Verifikasi dan ringkasan menunggu verifikasi", async ({ browser }) => {
  const { page, tutup } = await masuk(browser, USERS.ketua.nip);
  await expect(page.getByRole("heading", { level: 1, name: /^Selamat (pagi|siang|sore|malam), Pak$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Aksi cepat" }).getByRole("link", { name: /Verifikasi/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ringkasan" }).getByText("Menunggu verifikasi")).toBeVisible();
  await tanpaScrollHorizontal(page);
  await tutup();
});

test("aksi cepat Catat pekerjaan membuka form langsung (?catat=1); Lapor event membuka form event (?baru=1)", async ({ browser }) => {
  const { page, tutup } = await masuk(browser, USERS.yul.nip);
  await page.getByRole("region", { name: "Aksi cepat" }).getByRole("link", { name: /Catat pekerjaan hari ini/ }).click();
  await page.waitForURL("**/hari-ini?catat=1");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Catat pekerjaan" })).toBeVisible();

  await page.goto("/beranda");
  await page.getByRole("region", { name: "Aksi cepat" }).getByRole("link", { name: /Lapor event/ }).click();
  await page.waitForURL("**/event?baru=1");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Lapor event" })).toBeVisible();
  await tutup();
});

test("Lapor event: validasi inline, tanggal masa depan ditolak server, lalu tersimpan dengan lampiran", async ({ browser }) => {
  const { page, tutup } = await masuk(browser, USERS.yul.nip);
  await page.goto("/event?baru=1", { waitUntil: "networkidle" });
  const form = page.getByRole("dialog");

  // Validasi inline (Bahasa Indonesia).
  await form.getByRole("button", { name: "Simpan" }).click();
  for (const pesan of ["Judul event wajib diisi.", "Lokasi wajib diisi.", "Peran wajib diisi.", "Uraian hasil wajib diisi."]) {
    await expect(form.getByText(pesan)).toBeVisible();
  }

  await form.getByLabel("Judul event").fill(judulEvent);
  await form.getByLabel("Jenis").selectOption({ label: "Pelatihan" });
  await expect(form.getByLabel("Tanggal mulai")).toHaveValue("2026-10-14");
  await form.getByLabel("Lokasi").fill("Aula BPS Kerinci");
  await form.getByLabel("Peran Anda").fill("Peserta");
  await form.getByLabel("Uraian hasil").fill("Mempraktikkan modul pengolahan data.");

  // Tanggal masa depan: ditolak server dengan pesan jelas, form tetap terbuka.
  await form.getByLabel("Tanggal mulai").fill("2026-10-20");
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(form.getByRole("alert")).toContainText("masa depan");
  await form.getByLabel("Tanggal mulai").fill("2026-10-14");
  await form.getByLabel("Tanggal selesai").fill("2026-10-14");

  await form.locator('input[type="file"][multiple]').setInputFiles({ name: "foto-pelatihan.png", mimeType: "image/png", buffer: contohPng() });
  await expect(form.getByText("foto-pelatihan.png")).toBeVisible();
  await form.getByRole("button", { name: "Simpan" }).click();

  await expect(page.getByText("Event tersimpan.").first()).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: judulEvent });
  await expect(item).toBeVisible();
  await expect(item.getByText("Pelatihan", { exact: true })).toBeVisible();
  await expect(item.getByText("foto-pelatihan.png")).toBeVisible();
  await expect(item.getByRole("button", { name: "Ubah" })).toBeVisible();
  await expect(item.getByRole("button", { name: "Hapus" })).toBeVisible();

  // Muncul di aktivitas terbaru Beranda.
  await page.goto("/beranda");
  await expect(page.getByRole("region", { name: "Aktivitas terbaru" }).getByText(judulEvent)).toBeVisible();
  await tanpaScrollHorizontal(page);
  await tutup();
});

test("ketua tim melihat event anggota di tab Event tim, hanya baca (tanpa Ubah/Hapus)", async ({ browser }) => {
  const { page, tutup } = await masuk(browser, USERS.ketua.nip);
  await page.getByRole("navigation", { name: "Menu utama" }).getByRole("link", { name: "Event" }).click();
  await page.waitForURL("**/event");

  await page.getByRole("tab", { name: "Event tim" }).click();
  const item = page.getByRole("listitem").filter({ hasText: judulEvent });
  await expect(item).toBeVisible();
  await expect(item.getByText(`Pelapor: ${USERS.yul.nama}`)).toBeVisible();
  await expect(item.getByText("foto-pelatihan.png")).toBeVisible();
  await expect(item.getByRole("button", { name: "Ubah" })).toHaveCount(0);
  await expect(item.getByRole("button", { name: "Hapus" })).toHaveCount(0);

  // Event milik pegawai tidak muncul di "Event saya" ketua.
  await page.getByRole("tab", { name: "Event saya" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: judulEvent })).toHaveCount(0);
  await tanpaScrollHorizontal(page);
  await tutup();
});

test("pemilik mengubah lalu menghapus event lewat UI", async ({ browser }) => {
  const { page, tutup } = await masuk(browser, USERS.yul.nip);
  await page.goto("/event", { waitUntil: "networkidle" });
  const item = page.getByRole("listitem").filter({ hasText: judulEvent });
  await item.getByRole("button", { name: "Ubah" }).click();

  const form = page.getByRole("dialog");
  await expect(form.getByRole("heading", { name: "Ubah event" })).toBeVisible();
  await form.getByLabel("Lokasi").fill("Ruang Pelatihan Lantai 2");
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Ruang Pelatihan Lantai 2" })).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("listitem").filter({ hasText: judulEvent }).getByRole("button", { name: "Hapus" }).click();
  await expect(page.getByText("Event dihapus.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: judulEvent })).toHaveCount(0);
  await tutup();
});
