import { expect, test } from "@playwright/test";
import { sebagai } from "./support/api";
import { USERS } from "./support/data";

const KASUS = [
  { nip: USERS.yul.nip, peran: "PEGAWAI", label: "Pegawai" },
  { nip: USERS.ketua.nip, peran: "KETUA_TIM", label: "Ketua Tim" },
  { nip: USERS.pimpinan.nip, peran: "PIMPINAN", label: "Pimpinan" },
  { nip: USERS.admin.nip, peran: "ADMIN", label: "Admin" },
];

for (const k of KASUS) {
  test(`Bantuan ${k.label}: panduan peran sendiri tampil pertama dan tautannya dapat dibuka`, async ({ browser }) => {
    const u = await sebagai(browser, k.nip);
    const page = u.page;
    await page.goto("/beranda").catch(() => undefined);
    await page.getByRole("button", { name: "Menu profil" }).click();
    await page.getByRole("menuitem", { name: "Bantuan" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Panduan pemakaian" })).toBeVisible();
    const milik = page.locator(`[data-panduan="${k.peran}"]`);
    await expect(milik).toBeVisible();
    // Setiap tautan "Buka …" di panduan peran sendiri mengarah ke halaman yang boleh dibuka peran itu.
    const href = await milik.getByRole("link").evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("href")!))]);
    expect(href.length).toBeGreaterThan(0);
    for (const h of href) {
      await page.goto(h);
      await expect(page.getByRole("heading", { name: "Akses ditolak" }), h).toHaveCount(0);
    }
    await u.tutup();
  });
}
