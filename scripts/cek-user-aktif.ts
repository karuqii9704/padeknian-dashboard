/**
 * Daftar akun aktif beserta peran, untuk cek cepat isi database (Neon/lokal).
 * Script baca-saja: tidak mengubah data. NIP ditampilkan karena dipakai untuk login uji.
 *   npx tsx scripts/cek-user-aktif.ts
 */
import { buatPrisma } from "../lib/prisma-klien";

const db = buatPrisma();

async function main() {
  const users = await db.user.findMany({
    where: { isActive: true },
    select: { nip: true, nama: true, role: true },
    orderBy: [{ role: "asc" }, { nama: "asc" }],
  });
  if (users.length === 0) {
    console.log("TIDAK ADA akun aktif.");
    return;
  }
  console.log(users.map((x) => `${x.role}\t${x.nip}\t${x.nama}`).join("\n"));
  console.log(`\nTotal akun aktif: ${users.length}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
