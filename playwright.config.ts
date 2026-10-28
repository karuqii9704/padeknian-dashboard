import { defineConfig } from "@playwright/test";
import { FAKE_TODAY } from "./e2e/support/data";

// Jalankan dengan DATABASE_URL yang mengarah ke database ber-nama "*e2e*" (di-reset otomatis):
//   DATABASE_URL=postgresql://padeknian:padeknian@127.0.0.1:15432/padeknian_e2e npm run test:e2e
const port = Number(process.env.E2E_PORT ?? 3100);

// Storage lokal untuk E2E (kredensial dev MinIO dari docker-compose); bucket khusus agar tidak bercampur data lain.
process.env.S3_ENDPOINT ??= "http://localhost:9000";
process.env.S3_PUBLIC_ENDPOINT ??= process.env.S3_ENDPOINT;
process.env.S3_KEY ??= "minioadmin";
process.env.S3_SECRET ??= "minioadmin";
process.env.S3_BUCKET ??= "bukti-dukung-e2e";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    // Memakai Edge/Chrome yang sudah terpasang (tanpa mengunduh browser Playwright).
    channel: process.env.E2E_CHANNEL ?? "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    // Build produksi: lebih cepat saat uji dan lebih mirip lingkungan nyata.
    command: `npx next build && npx next start -p ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: { ...process.env, APP_FAKE_TODAY: FAKE_TODAY } as Record<string, string>,
  },
});
