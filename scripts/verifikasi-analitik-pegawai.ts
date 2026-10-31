/**
 * Verifikasi data analitik pegawai yang dipakai halaman "Informasi Pegawai".
 * Script baca-saja: memastikan insight & grafik terisi data nyata dari Neon.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const periode = await db.periode.findFirst({ where: { status: "AKTIF" }, orderBy: [{ tahun: "desc" }, { bulan: "desc" }] });
  const users = await db.user.findMany({ select: { id: true, nama: true, role: true, isActive: true, mustChangePassword: true, lastLoginAt: true } });
  console.log(`Periode aktif: ${periode ? `${periode.tahun}-${String(periode.bulan).padStart(2, "0")} (${periode.status})` : "TIDAK ADA"}`);
  console.log(`Total pegawai: ${users.length}`);
  console.log(`  aktif: ${users.filter((u) => u.isActive).length}`);
  console.log(`  wajib ganti password: ${users.filter((u) => u.mustChangePassword).length}`);
  console.log(`  belum pernah login: ${users.filter((u) => u.lastLoginAt === null).length}`);
  const perPeran = new Map<string, number>();
  for (const u of users) perPeran.set(u.role, (perPeran.get(u.role) ?? 0) + 1);
  console.log(`  per peran: ${[...perPeran.entries()].map(([r, n]) => `${r}=${n}`).join(", ")}`);

  if (periode) {
    const status = await db.pekerjaanHarian.groupBy({ by: ["statusVerifikasi"], where: { periodeId: periode.id }, _count: { _all: true } });
    console.log(`\nEntri pada periode: ${status.reduce((a, s) => a + s._count._all, 0)}`);
    for (const s of status) console.log(`  ${s.statusVerifikasi}: ${s._count._all}`);

    const perUser = await db.pekerjaanHarian.groupBy({ by: ["userId"], where: { periodeId: periode.id }, _count: { _all: true } });
    console.log(`  pegawai yang mengisi: ${perUser.length}`);
    const bukti = await db.buktiDukung.count({ where: { pekerjaanHarian: { periodeId: periode.id } } });
    console.log(`  bukti dukung: ${bukti}`);

    const hari = await db.pekerjaanHarian.groupBy({ by: ["tanggal"], where: { periodeId: periode.id }, _count: { _all: true }, orderBy: { tanggal: "asc" } });
    console.log(`  hari dengan aktivitas: ${hari.length}`);
    console.log(`  (grafik tren harian akan berisi ${hari.length} titik)`);

    // Konfirmasi tidak ada ketua yang tercatat sebagai anggota.
    const tim = await db.timKerja.findMany({ select: { nama: true, ketuaId: true, anggota: { select: { userId: true, peranDalamTim: true } } } });
    for (const t of tim) {
      const dup = t.anggota.filter((a) => a.userId === t.ketuaId);
      console.log(`\nTim "${t.nama}": anggota=${t.anggota.length}, ketua tercatat sebagai anggota=${dup.length} ${dup.length === 0 ? "(OK)" : "(BUG!)"}`);
    }
  }

  // Daftar akun admin (tanpa hash password) untuk memastikan akun awal masih ada & aktif.
  const admin = await db.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, nip: true, nama: true, isActive: true, mustChangePassword: true },
  });
  console.log(`\nAkun admin: ${admin.length}`);
  for (const a of admin) {
    console.log(`  ${a.nip} — ${a.nama} | aktif=${a.isActive} | wajib ganti password=${a.mustChangePassword}`);
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
