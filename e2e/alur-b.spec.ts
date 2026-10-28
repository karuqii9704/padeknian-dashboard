import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { recalculateProgresAlokasi } from "../lib/progres-alokasi";
import { FAKE_TODAY, USERS } from "./support/data";
import { E2E_PASSWORD } from "./support/data";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

// Alur B dari sudut pandang pegawai di HP: viewport 360px.
test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });
test.describe.configure({ mode: "serial" });

const penugasan: Record<string, string> = {};
let tariId = "";

async function tinggiMinimal(l: Locator, px = 44) {
  const box = await l.boundingBox();
  expect(box, "elemen harus terlihat").not.toBeNull();
  expect(box!.height, "tinggi sentuh minimal 44px").toBeGreaterThanOrEqual(px);
}

async function login(page: Page, nip: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("NIP atau email").fill(nip);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
}

test("setup: ketua membuat 3 alokasi untuk Tari dan menyiapkan riwayat kalender", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, USERS.ketua.nip);
  await page.waitForURL("**/hari-ini");
  const periode = ((await (await page.request.get("/api/periode")).json()).data as { id: string; status: string }[]).find((p) => p.status === "AKTIF")!;
  const tim = (await (await page.request.get("/api/tim")).json()).data[0] as { id: string };
  const anggota = (await (await page.request.get(`/api/tim/${tim.id}/anggota?periodeId=${periode.id}`)).json()).anggota as { userId: string; nama: string }[];
  tariId = anggota.find((a) => a.nama === USERS.tari.nama)!.userId;

  const buat = async (judul: string, prioritas: string, selesai: string, target: number) => {
    const r = await page.request.post("/api/alokasi", {
      data: {
        timId: tim.id,
        periodeId: periode.id,
        judul,
        deskripsi: "uji alur B",
        tanggalMulai: "2026-10-01",
        tanggalSelesai: selesai,
        targetVolume: target,
        satuan: "dokumen",
        prioritas,
        penugasan: [{ userId: tariId }],
      },
    });
    expect(r.status()).toBe(201);
    const a = (await r.json()).alokasi;
    penugasan[judul] = a.penugasan[0].id;
    return a.id as string;
  };
  await buat("Rendah dekat", "RENDAH", "2026-10-16", 30);
  await buat("Tinggi jauh", "TINGGI", "2026-10-30", 80);
  const idDekat = await buat("Tinggi dekat", "TINGGI", "2026-10-20", 50);
  await ctx.close();

  // Riwayat: 13 Okt disetujui, 12 Okt perlu revisi (disisipkan langsung; verifikasi baru ada di Fase 2).
  const mk = (tanggal: string, statusVerifikasi: "DISETUJUI" | "MINTA_REVISI") =>
    prisma.pekerjaanHarian.create({
      data: {
        periodeId: periode.id,
        penugasanId: penugasan["Tinggi dekat"],
        userId: tariId,
        tanggal: new Date(`${tanggal}T00:00:00Z`),
        deskripsiCapaian: `Riwayat ${tanggal}`,
        volume: 5,
        satuan: "dokumen",
        statusVerifikasi,
      },
    });
  await mk("2026-10-13", "DISETUJUI");
  await mk("2026-10-12", "MINTA_REVISI");
  await recalculateProgresAlokasi(idDekat);
});

test("login → catat pekerjaan tersimpan < 2 menit di 360px; default alokasi TINGGI dengan deadline terdekat", async ({ page }) => {
  const mulai = Date.now();
  await login(page, USERS.tari.nip);
  await page.waitForURL("**/hari-ini");

  await expect(page.getByRole("heading", { name: "Hari Ini", exact: true })).toBeVisible();
  await expect(page.getByText("Rabu, 14 Okt 2026")).toBeVisible();
  await expect(page.getByText("Belum ada catatan pekerjaan hari ini.")).toBeVisible();

  const catat = page.getByRole("button", { name: "+ Catat Pekerjaan" });
  await tinggiMinimal(catat);
  await catat.click();

  const form = page.getByRole("dialog");
  const pilih = form.getByLabel("Alokasi pekerjaan");
  await expect(pilih.locator("option:checked")).toHaveText("Tinggi dekat");
  // Volume default = sisa target (50 - 5 disetujui - 5 menunggu... riwayat: 5 disetujui; revisi tidak dihitung).
  await expect(form.getByLabel(/^Volume/)).toHaveValue("45");
  await expect(form.getByLabel("Tanggal")).toHaveValue(FAKE_TODAY);

  await form.getByLabel("Deskripsi capaian").fill("Entri 45 dokumen kuesioner");
  await tinggiMinimal(form.getByRole("button", { name: "Simpan" }));
  await tinggiMinimal(form.getByLabel("Deskripsi capaian"), 44);
  await form.getByRole("button", { name: "Simpan" }).click();

  await expect(page.getByText("Catatan tersimpan.")).toBeVisible();
  await expect(page.getByText("Sudah ada 1 catatan hari ini.")).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: "Entri 45 dokumen kuesioner" });
  await expect(item.getByText("Menunggu verifikasi")).toBeVisible();

  expect(Date.now() - mulai, "alur login sampai tersimpan").toBeLessThan(120_000);
  const lebar = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(lebar, "tanpa scroll horizontal").toBeLessThanOrEqual(360);
});

test("validasi inline pada form entri (Bahasa Indonesia)", async ({ page }) => {
  await login(page, USERS.tari.nip);
  await page.waitForURL("**/hari-ini");
  await page.getByRole("button", { name: "+ Catat Pekerjaan" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel(/^Volume/).fill("");
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(form.getByText("Deskripsi capaian wajib diisi.")).toBeVisible();
  await expect(form.getByText("Volume wajib diisi.")).toBeVisible();

  await form.getByLabel("Alokasi pekerjaan").selectOption({ label: "Tugas tambahan (di luar alokasi)" });
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(form.getByText("Judul tugas tambahan wajib diisi.")).toBeVisible();
  await expect(form.getByText("Satuan wajib diisi.")).toBeVisible();
});

test("kalender menandai 4 status warna; badge Revisi muncul; perbaikan mengembalikan ke menunggu", async ({ page }) => {
  await login(page, USERS.tari.nip);
  await page.waitForURL("**/hari-ini");

  // Badge Revisi di navigasi (1 entri MINTA_REVISI).
  const navRevisi = page.getByRole("navigation", { name: "Menu utama" }).getByRole("link", { name: /Revisi/ });
  await expect(navRevisi.getByLabel("1 perlu revisi")).toBeVisible();

  await page.goto("/kalender", { waitUntil: "networkidle" });
  const hari = (t: string) => page.locator(`[data-tanggal="${t}"]`);
  await expect(hari("2026-10-02")).toHaveAttribute("data-status", "KOSONG"); // Jumat, tanpa entri
  await expect(hari("2026-10-14")).toHaveAttribute("data-status", "MENUNGGU"); // entri dari tes sebelumnya
  await expect(hari("2026-10-13")).toHaveAttribute("data-status", "DISETUJUI");
  await expect(hari("2026-10-12")).toHaveAttribute("data-status", "REVISI");
  await expect(hari("2026-10-10")).toHaveAttribute("data-status", "LIBUR"); // Sabtu
  await expect(hari("2026-10-08")).toHaveAttribute("data-status", "LIBUR"); // libur uji
  await tinggiMinimal(hari("2026-10-14"), 44);
  await expect(page.getByLabel("Keterangan warna").getByText("Perlu revisi")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Halaman Revisi: perbaiki entri.
  await page.getByRole("navigation", { name: "Menu utama" }).getByRole("link", { name: /Revisi/ }).click();
  await page.waitForURL("**/revisi");
  const kartu = page.getByRole("listitem").filter({ hasText: "Riwayat 2026-10-12" });
  await expect(kartu.getByText("Perlu revisi")).toBeVisible();
  await kartu.getByRole("button", { name: "Perbaiki" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Deskripsi capaian").fill("Riwayat 2026-10-12 sudah diperbaiki");
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Perbaikan tersimpan. Catatan menunggu verifikasi ulang.")).toBeVisible();
  await expect(page.getByText("Tidak ada catatan yang perlu direvisi.")).toBeVisible();
  await expect(navRevisi.getByLabel("1 perlu revisi")).toHaveCount(0);

  await page.goto("/kalender", { waitUntil: "networkidle" });
  await expect(hari("2026-10-12")).toHaveAttribute("data-status", "MENUNGGU");
});

test("tugas tambahan (ad-hoc) tersimpan dan tampil di Hari Ini", async ({ page }) => {
  await login(page, USERS.tari.nip);
  await page.waitForURL("**/hari-ini");
  await page.getByRole("button", { name: "+ Catat Pekerjaan" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Alokasi pekerjaan").selectOption({ label: "Tugas tambahan (di luar alokasi)" });
  await form.getByLabel("Judul tugas tambahan").fill("Bantu rapat koordinasi");
  await form.getByLabel("Satuan").fill("kegiatan");
  await form.getByLabel("Deskripsi capaian").fill("Menyusun notulen rapat");
  await form.getByLabel(/^Volume/).fill("1");
  await form.getByRole("button", { name: "Simpan" }).click();
  const item = page.getByRole("listitem").filter({ hasText: "Menyusun notulen rapat" });
  await expect(item.getByText("Bantu rapat koordinasi")).toBeVisible();
  await expect(page.getByText("Sudah ada 2 catatan hari ini.")).toBeVisible();
});
