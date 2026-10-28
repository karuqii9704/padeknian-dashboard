import { PgBoss } from "pg-boss";
import { logger } from "@/lib/logger";

export const QUEUE_REKAP = "rekap-generate";
export const QUEUE_REKAP_XLSX = "rekap-xlsx";
export type JobRekap = { rekapId: string };
export type JobXlsx = { batchId: string };

const OPSI_ANTREAN_REKAP = {
  retryLimit: 0, // kegagalan dicatat sebagai status GAGAL pada RekapSKP; ulangi lewat generate baru
  expireInSeconds: 15 * 60,
  deleteAfterSeconds: 24 * 3600,
};

const OPSI_ANTREAN_XLSX = {
  retryLimit: 2, // pembuatan file dapat diulang otomatis (idempoten)
  retryDelay: 5,
  expireInSeconds: 15 * 60,
  deleteAfterSeconds: 24 * 3600,
};

/** Buat instance pg-boss yang terhubung ke DATABASE_URL (skema `pgboss` dikelola pg-boss sendiri). */
export function buatBoss(opsi: { supervise?: boolean; schedule?: boolean } = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diatur.");
  const boss = new PgBoss({ connectionString: url, ...opsi });
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  return boss;
}

export async function siapkanAntrean(boss: PgBoss) {
  await boss.start();
  await boss.createQueue(QUEUE_REKAP, OPSI_ANTREAN_REKAP);
  await boss.createQueue(QUEUE_REKAP_XLSX, OPSI_ANTREAN_XLSX);
}

// Sisi web hanya mengirim job (pemrosesan dilakukan proses worker terpisah).
const g = globalThis as unknown as { __bossWeb?: Promise<PgBoss> };

export function bossWeb() {
  g.__bossWeb ??= (async () => {
    const boss = buatBoss({ supervise: false, schedule: false });
    await siapkanAntrean(boss);
    return boss;
  })().catch((e) => {
    g.__bossWeb = undefined; // coba lagi pada permintaan berikutnya
    throw e;
  });
  return g.__bossWeb;
}

/**
 * Tanpa proses worker (Vercel, atau Render dengan JOBS_INLINE=1), job dijalankan langsung setelah respons
 * terkirim (`after`), sehingga antrean pg-boss tidak dipakai. Tempat lain tetap memakai worker (`npm run worker`).
 */
const inline = () => !!process.env.VERCEL || process.env.JOBS_INLINE === "1";

export async function kirimJobRekap(rekapId: string) {
  if (inline()) {
    const [{ after }, { prosesRekap }] = await Promise.all([import("next/server"), import("@/lib/rekap-proses")]);
    after(() => prosesRekap(rekapId));
    return "inline";
  }
  const boss = await bossWeb();
  const id = await boss.send(QUEUE_REKAP, { rekapId } satisfies JobRekap);
  if (!id) throw new Error("Gagal mengantrekan job rekap.");
  return id;
}

/** Antrekan pembuatan XLSX batch; satu job per batch (singletonKey) walau banyak rekap selesai bersamaan. */
export async function kirimJobXlsx(batchId: string) {
  if (inline()) {
    const [{ after }, { prosesXlsxBatch }] = await Promise.all([import("next/server"), import("@/lib/rekap-xlsx-proses")]);
    after(() => prosesXlsxBatch(batchId));
    return "inline";
  }
  const boss = await bossWeb();
  return boss.send(QUEUE_REKAP_XLSX, { batchId } satisfies JobXlsx, { singletonKey: batchId });
}
