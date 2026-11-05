import { execSync, spawn, type ChildProcess } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { E2E_PASSWORD, FAKE_TODAY, LIBUR_UJI, NIP_GAGAL, TIM2_NAMA, TIM_NAMA, USERS } from "./support/data";

/** Matikan proses beserta anak-anaknya (tsx menjalankan node sebagai proses anak). */
function matikan(p: ChildProcess) {
  if (!p.pid || p.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: "ignore" });
    } catch {
      /* sudah berhenti */
    }
  } else {
    p.kill("SIGTERM");
  }
}

/** Jalankan worker pg-boss (proses terpisah) dan tunggu sampai siap. */
async function jalankanWorker() {
  const worker = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "worker/index.ts"], {
    env: { ...process.env, REKAP_GAGALKAN_NIP: NIP_GAGAL, PENGINGAT_NONAKTIF: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Worker tidak siap dalam 60 detik.\n${log}`)), 60_000);
    const kumpul = (d: Buffer) => {
      log += d.toString();
      if (log.includes("worker siap")) {
        clearTimeout(timer);
        resolve();
      }
    };
    worker.stdout?.on("data", kumpul);
    worker.stderr?.on("data", kumpul);
    worker.on("exit", (c) => {
      clearTimeout(timer);
      reject(new Error(`Worker berhenti (kode ${c}).\n${log}`));
    });
  });
  worker.stdout?.removeAllListeners("data");
  worker.stderr?.removeAllListeners("data");
  worker.stdout?.resume();
  worker.stderr?.resume();
  return worker;
}

function dbName(url: string) {
  return new URL(url).pathname.replace(/^\//, "");
}

export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? "";
  // Pengaman: reset hanya boleh pada database yang namanya jelas untuk E2E.
  if (!/e2e/i.test(dbName(url))) {
    throw new Error(`E2E menolak berjalan: nama database "${dbName(url)}" harus mengandung "e2e".`);
  }

  // Kosongkan schema (hanya database *e2e*, dijaga di atas) lalu terapkan semua migrasi.
  const admin = new PrismaClient();
  try {
    await admin.$executeRawUnsafe("DROP SCHEMA public CASCADE");
    await admin.$executeRawUnsafe("CREATE SCHEMA public");
    await admin.$executeRawUnsafe("DROP SCHEMA IF EXISTS pgboss CASCADE"); // antrean dari proses sebelumnya
  } finally {
    await admin.$disconnect();
  }
  execSync("node node_modules/prisma/build/index.js migrate deploy", { stdio: "ignore", env: process.env });

  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.hash(E2E_PASSWORD, 4); // cost rendah hanya untuk kecepatan uji
    const users: Record<string, string> = {};
    for (const [key, u] of Object.entries(USERS)) {
      const row = await prisma.user.create({
        data: { nip: u.nip, nama: u.nama, role: u.role, passwordHash: hash },
      });
      users[key] = row.id;
    }

    const now = new Date(`${FAKE_TODAY}T00:00:00Z`);
    const tahun = now.getUTCFullYear();
    const bulan = now.getUTCMonth() + 1;
    await prisma.hariLibur.create({
      data: { tanggal: new Date(`${LIBUR_UJI.tanggal}T00:00:00Z`), keterangan: LIBUR_UJI.keterangan, jenis: "LIBUR_LAIN" },
    });
    const periode = await prisma.periode.create({
      data: {
        tahun,
        bulan,
        tanggalMulai: new Date(Date.UTC(tahun, bulan - 1, 1)),
        tanggalSelesai: new Date(Date.UTC(tahun, bulan, 0)),
        status: "AKTIF",
        jumlahHariKerja: 20,
      },
    });
    const tim = await prisma.timKerja.create({ data: { nama: TIM_NAMA, tahun, ketuaId: users.ketua } });
    for (const key of ["ketua", "yul", "rina", "tari"]) {
      await prisma.anggotaTim.create({
        data: { timId: tim.id, userId: users[key], periodeId: periode.id, peranDalamTim: key === "ketua" ? "KETUA" : "ANGGOTA" },
      });
    }

    // Tim kedua (untuk menguji isolasi lintas tim).
    const tim2 = await prisma.timKerja.create({ data: { nama: TIM2_NAMA, tahun, ketuaId: users.ketua2 } });
    for (const key of ["ketua2", "sari"]) {
      await prisma.anggotaTim.create({
        data: { timId: tim2.id, userId: users[key], periodeId: periode.id, peranDalamTim: key === "ketua2" ? "KETUA" : "ANGGOTA" },
      });
    }

    // Periode sebelumnya (DRAFT) berisi 1 alokasi lama; Dewi anggota saat itu tapi bukan di periode berjalan.
    const mk = (offset: number, status: "DRAFT" | "DIKUNCI") => {
      const d = new Date(Date.UTC(tahun, bulan - 1 - offset, 1));
      return prisma.periode.create({
        data: {
          tahun: d.getUTCFullYear(),
          bulan: d.getUTCMonth() + 1,
          tanggalMulai: d,
          tanggalSelesai: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)),
          status,
          jumlahHariKerja: 20,
        },
      });
    };
    const lalu = await mk(1, "DRAFT");
    await mk(2, "DIKUNCI");
    for (const key of ["ketua", "yul", "dewi"]) {
      await prisma.anggotaTim.create({
        data: { timId: tim.id, userId: users[key], periodeId: lalu.id, peranDalamTim: key === "ketua" ? "KETUA" : "ANGGOTA" },
      });
    }
    await prisma.alokasi.create({
      data: {
        periodeId: lalu.id,
        timId: tim.id,
        judul: "Pengolahan Susenas",
        deskripsi: "Pengolahan data Susenas",
        tanggalMulai: new Date(Date.UTC(lalu.tahun, lalu.bulan - 1, 3)),
        tanggalSelesai: new Date(Date.UTC(lalu.tahun, lalu.bulan - 1, 25)),
        targetVolume: 50,
        satuan: "blok sensus",
        prioritas: "SEDANG",
        dibuatOlehId: users.ketua,
        penugasan: { create: [{ userId: users.yul, targetVolume: 30 }, { userId: users.dewi, targetVolume: 20 }] },
      },
    });
    await prisma.alokasi.create({
      data: {
        periodeId: lalu.id,
        timId: tim.id,
        judul: "Alokasi dibatalkan bulan lalu",
        deskripsi: "x",
        tanggalMulai: new Date(Date.UTC(lalu.tahun, lalu.bulan - 1, 3)),
        tanggalSelesai: new Date(Date.UTC(lalu.tahun, lalu.bulan - 1, 10)),
        targetVolume: 5,
        satuan: "dok",
        status: "DIBATALKAN",
        alasanPembatalan: "Tidak jadi",
        dibuatOlehId: users.ketua,
        penugasan: { create: [{ userId: users.yul, targetVolume: 5 }] },
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  // Worker pg-boss berjalan selama seluruh suite (rekap/ekspor diproses di luar proses web).
  const worker = await jalankanWorker();
  return async () => matikan(worker);
}
