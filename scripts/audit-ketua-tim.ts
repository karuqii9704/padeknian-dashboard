/**
 * Audit data: apakah Ketua Tim pernah/dapat tercatat sebagai anggota (AnggotaTim)?
 * Script sekali jalan untuk memeriksa data nyata di Neon, lalu tidak mengubah apa pun.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const tims = await db.timKerja.findMany({
    select: {
      id: true,
      nama: true,
      tahun: true,
      isActive: true,
      ketuaId: true,
      ketua: { select: { id: true, nama: true, nip: true, role: true } },
      anggota: {
        select: {
          id: true,
          periodeId: true,
          userId: true,
          peranDalamTim: true,
          user: { select: { nama: true, nip: true, role: true } },
          periode: { select: { tahun: true, bulan: true, status: true } },
        },
      },
    },
    orderBy: [{ tahun: "desc" }, { nama: "asc" }],
  });

  console.log(`Total tim: ${tims.length}\n`);

  let totalBermasalah = 0;
  for (const t of tims) {
    // Aturan bisnis: ketua tim memimpin lewat TimKerja.ketuaId dan TIDAK boleh punya baris AnggotaTim.
    // Jadi setiap baris dengan userId == ketuaId adalah bug, apa pun nilai peranDalamTim-nya.
    const masalah = t.anggota.filter((a) => a.userId === t.ketuaId);
    // Baris berlabel KETUA milik orang lain juga salah (tidak ada leader kedua).
    const peranBermasalah = t.anggota.filter((a) => a.peranDalamTim === "KETUA" && a.userId !== t.ketuaId);

    console.log(`── ${t.nama} (${t.tahun}) ${t.isActive ? "AKTIF" : "NONAKTIF"}`);
    console.log(`   Ketua: ${t.ketua.nama} [${t.ketua.nip}] role=${t.ketua.role}`);
    console.log(`   Anggota records: ${t.anggota.length}`);
    if (t.anggota.length) {
      for (const a of t.anggota) {
        const flag = a.userId === t.ketuaId ? " <== KETUA TERCATAT" : "";
        console.log(
          `     - ${a.user.nama} [${a.user.nip}] peran=${a.peranDalamTim} periode=${a.periode.tahun}-${String(a.periode.bulan).padStart(2, "0")} (${a.periode.status})${flag}`,
        );
      }
    }
    if (masalah.length) {
      totalBermasalah += masalah.length;
      console.log(`   ⚠ BUG: ketua tim tercatat sebagai anggota pada ${masalah.length} baris (${masalah.map((m) => `${m.periode.tahun}-${m.periode.bulan}`).join(", ")})`);
    }
    if (peranBermasalah.length)
      console.log(`   ⚠ BUG: ${peranBermasalah.length} baris berlabel KETUA tapi bukan ketua tim: ${peranBermasalah.map((p) => p.user.nama).join(", ")}`);
    console.log();
  }

  // Cross-check: users with role KETUA_TIM that lead more than one active team
  const leaders = await db.user.findMany({ where: { role: "KETUA_TIM" }, select: { id: true, nama: true, nip: true, isActive: true } });
  console.log(`\nPengguna role KETUA_TIM: ${leaders.length}`);
  for (const l of leaders) {
    const led = await db.timKerja.findMany({ where: { ketuaId: l.id }, select: { nama: true, tahun: true, isActive: true } });
    console.log(`  ${l.nama} [${l.nip}] aktif=${l.isActive} memimpin ${led.length} tim: ${led.map((x) => `${x.nama} ${x.tahun}${x.isActive ? "" : " (nonaktif)"}`).join(", ") || "-"}`);
  }

  console.log(`\n=== TOTAL BARIS BERMASALAH: ${totalBermasalah} ===`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
