import { buatPrisma } from "../lib/prisma-klien";
import bcrypt from "bcryptjs";

const prisma = buatPrisma();

// Hanya libur nasional bertanggal tetap. Libur yang tanggalnya berubah tiap tahun
// (Idul Fitri, Idul Adha, Nyepi, Waisak, dll.) wajib diinput Admin dari SKB resmi.
const LIBUR_TETAP: [string, string][] = [
  ["01-01", "Tahun Baru Masehi"],
  ["05-01", "Hari Buruh Internasional"],
  ["06-01", "Hari Lahir Pancasila"],
  ["08-17", "Hari Kemerdekaan RI"],
  ["12-25", "Hari Raya Natal"],
];

async function seedHariLiburContoh() {
  const tahun = new Date().getFullYear();
  for (const [md, keterangan] of LIBUR_TETAP) {
    const tanggal = new Date(`${tahun}-${md}T00:00:00.000Z`);
    await prisma.hariLibur.upsert({
      where: { tanggal },
      update: {},
      create: { tanggal, keterangan, jenis: "LIBUR_NASIONAL" },
    });
  }
  console.log(`seed: ${LIBUR_TETAP.length} hari libur tetap tahun ${tahun} (contoh)`);
}

async function main() {
  if (process.env.SEED_HARI_LIBUR_CONTOH === "true") await seedHariLiburContoh();
  const nip = process.env.ADMIN_NIP;
  const password = process.env.ADMIN_PASSWORD;

  if (!nip || !password) {
    throw new Error("ADMIN_NIP dan ADMIN_PASSWORD wajib diisi di env untuk seed admin awal.");
  }
  if (process.env.NODE_ENV === "production" && password.length < 12) {
    throw new Error("ADMIN_PASSWORD produksi minimal 12 karakter.");
  }

  const exists = await prisma.user.findUnique({ where: { nip } });
  if (exists) {
    console.log(`seed: admin dengan NIP ${nip} sudah ada, dilewati`);
    return;
  }

  const admin = await prisma.user.create({
    data: {
      nip,
      nama: process.env.ADMIN_NAMA ?? "Administrator",
      email: process.env.ADMIN_EMAIL || null,
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
      jabatan: "Admin Sistem",
    },
  });
  await prisma.auditLog.create({
    data: { aksi: "SEED_ADMIN", entitas: "User", entitasId: admin.id },
  });
  console.log(`seed: admin dibuat (NIP ${nip})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
