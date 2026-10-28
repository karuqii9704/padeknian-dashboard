import { expect, test } from "@playwright/test";
import { USERS } from "./support/data";
import { loginUI } from "./support/auth";

test.describe("Alur A — Ketua Tim membuat alokasi", () => {
  test("validasi inline lalu simpan ke 2 anggota; muncul dengan progress 0%", async ({ page }) => {
    await loginUI(page, USERS.ketua.nip);
    await page.goto("/alokasi");
    await page.getByRole("button", { name: "+ Tambah alokasi" }).click();

    // Kirim kosong -> pesan error Bahasa Indonesia inline.
    await page.getByRole("button", { name: "Simpan alokasi" }).click();
    await expect(page.getByText("Judul wajib diisi.")).toBeVisible();
    await expect(page.getByText("Deskripsi wajib diisi.")).toBeVisible();
    await expect(page.getByText("Target volume wajib diisi.")).toBeVisible();
    await expect(page.getByText("Satuan wajib diisi.")).toBeVisible();
    await expect(page.getByText("Pilih minimal satu penerima.")).toBeVisible();

    await page.getByLabel("Judul").fill("Entri data Sakernas");
    await page.getByLabel("Deskripsi").fill("Entri dokumen kuesioner Sakernas");
    await page.getByLabel("Target volume").first().fill("100");
    await page.getByLabel("Satuan").fill("dokumen");
    await page.getByRole("checkbox", { name: USERS.yul.nama }).check();
    await page.getByRole("checkbox", { name: USERS.rina.nama }).check();
    await page.getByLabel(`Target ${USERS.rina.nama}`).fill("40");

    await page.getByRole("button", { name: "Simpan alokasi" }).click();

    const kartu = page.getByRole("listitem").filter({ hasText: "Entri data Sakernas" }).first();
    await expect(kartu).toBeVisible();
    await expect(kartu.getByText(USERS.yul.nama)).toBeVisible();
    await expect(kartu.getByText(USERS.rina.nama)).toBeVisible();
    await expect(kartu.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "0");
    await expect(kartu.getByText("0 / 100 dokumen")).toBeVisible();
    await expect(kartu.getByText("0 / 40 dokumen")).toBeVisible();
  });

  test("tombol unduh daftar menghasilkan teks untuk WhatsApp", async ({ page }) => {
    await loginUI(page, USERS.ketua.nip);
    await page.goto("/alokasi");
    await expect(page.getByText("Entri data Sakernas").first()).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Unduh .txt" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^alokasi-\d{4}-\d{2}\.txt$/);
  });

  test("pegawai tidak melihat tombol tambah dan hanya melihat porsinya", async ({ page }) => {
    await loginUI(page, USERS.yul.nip);
    await page.goto("/alokasi");
    await expect(page.getByRole("button", { name: "+ Tambah alokasi" })).toHaveCount(0);
    await expect(page.getByText("Entri data Sakernas").first()).toBeVisible();
    await expect(page.getByText(USERS.rina.nama)).toHaveCount(0);
  });
});
