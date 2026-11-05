// Proses worker: memproses job dari pg-boss (rekap bulanan, XLSX, dan pengingat harian terjadwal).
//   npm run worker
import { buatBoss, JADWAL_PENGINGAT, QUEUE_PENGINGAT, QUEUE_REKAP, QUEUE_REKAP_XLSX, siapkanAntrean, type JobRekap, type JobXlsx } from "../lib/queue";
import { kirimPengingatHarian } from "../lib/pengingat";
import { logger } from "../lib/logger";
import { prosesRekap } from "../lib/rekap-proses";
import { prosesXlsxBatch } from "../lib/rekap-xlsx-proses";
import { db } from "../lib/db";

async function main() {
  const boss = buatBoss(); // worker menjalankan pemeliharaan (supervise) dan jadwal
  await siapkanAntrean(boss);

  // Beberapa job diproses paralel; prosesRekap tidak melempar sehingga satu kegagalan tidak menghentikan yang lain.
  await boss.work<JobRekap>(QUEUE_REKAP, { batchSize: 5, localConcurrency: 2 }, async (jobs) => {
    await Promise.all(jobs.map((j) => prosesRekap(j.data.rekapId)));
  });

  // Satu job XLSX per batch; error dilempar agar pg-boss mengulang (retry) pembuatan file.
  await boss.work<JobXlsx>(QUEUE_REKAP_XLSX, async (jobs) => {
    for (const j of jobs) await prosesXlsxBatch(j.data.batchId);
  });

  // Pengingat harian terjadwal (idempoten, jadi aman bila juga dipicu cron eksternal).
  // PENGINGAT_NONAKTIF=1 mematikan jadwal ini (mis. lingkungan uji).
  if (process.env.PENGINGAT_NONAKTIF !== "1") {
    await boss.schedule(QUEUE_PENGINGAT, JADWAL_PENGINGAT, {}, { tz: "Asia/Jakarta" });
  } else {
    await boss.unschedule(QUEUE_PENGINGAT).catch(() => undefined);
  }
  await boss.work(QUEUE_PENGINGAT, async () => {
    const hasil = await kirimPengingatHarian();
    logger.info({ hasil }, "pengingat harian");
  });

  logger.info("worker siap");
  console.log("worker siap");

  const berhenti = async () => {
    await boss.stop({ graceful: true, timeout: 20_000 }).catch(() => undefined);
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", berhenti);
  process.on("SIGTERM", berhenti);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
