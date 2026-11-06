import { expect, test } from "@playwright/test";
import { sebagai } from "./support/api";
import { USERS } from "./support/data";

test("manifest, ikon, dan service worker tersedia; sw.js tidak di-cache", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.status()).toBe(200);
  const manifest = await m.json();
  expect(manifest).toMatchObject({ short_name: "Padeknian", display: "standalone", start_url: "/" });
  for (const ikon of manifest.icons as { src: string }[]) expect((await request.get(ikon.src)).status(), ikon.src).toBe(200);
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-store");
  expect((await request.get("/offline.html")).status()).toBe(200);
});

test("tanpa jaringan, navigasi menampilkan halaman offline (bukan halaman berisi data)", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const page = yul.page;
  await page.goto("/beranda");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Pastikan halaman dikendalikan service worker sebelum memutus jaringan.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await page.context().setOffline(true);
  await page.goto("/hari-ini").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Anda sedang offline" })).toBeVisible();
  await page.context().setOffline(false);
  await yul.tutup();
});
