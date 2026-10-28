import type { Page } from "@playwright/test";
import { E2E_PASSWORD } from "./data";

export async function loginUI(page: Page, nip: string) {
  // Tunggu hidrasi React agar submit ditangani handler, bukan submit native.
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("NIP atau email").fill(nip);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
