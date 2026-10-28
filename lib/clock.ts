import { logger } from "@/lib/logger";

let sudahPeringatan = false;

/**
 * Tanggal hari ini (YYYY-MM-DD) di zona Asia/Jakarta.
 * `APP_FAKE_TODAY` hanya untuk pengujian E2E agar hasil deterministik; JANGAN diisi di produksi.
 */
export function hariIni(): string {
  const fake = process.env.APP_FAKE_TODAY;
  if (fake && /^\d{4}-\d{2}-\d{2}$/.test(fake)) {
    if (!sudahPeringatan) {
      sudahPeringatan = true;
      logger.warn({ fake }, "APP_FAKE_TODAY aktif: tanggal sistem dipalsukan (hanya untuk uji)");
    }
    return fake;
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}
