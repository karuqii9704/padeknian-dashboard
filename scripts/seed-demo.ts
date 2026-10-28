// Data demo untuk review manual (BUKAN produksi). Idempotent: dilewati bila Tim demo sudah ada.
//   npx tsx scripts/seed-demo.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { recalculateSemua } from "../lib/progres-alokasi";

const prisma = new PrismaClient();
export const PASSWORD_DEMO = "Demo-12345";
const TIM = "Tim Statistik Produksi (Demo)";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function main() {
  if (await prisma.timKerja.findFirst({ where: { nama: TIM } })) return console.log("seed-demo: data demo sudah ada, dilewati");
  const hash = await bcrypt.hash(PASSWORD_DEMO, 12);
  const mk = (nip: string, nama: string, role: "PEGAWAI" | "KETUA_TIM" | "PIMPINAN", jabatan: string) =>
    prisma.user.create({ data: { nip, nama, role, jabatan, passwordHash: hash } });
  const pimpinan = await mk("196501012000011001", "Bu Kepala BPS (Demo)", "PIMPINAN", "Kepala BPS Kabupaten");
  const ketua = await mk("197001012000011001", "Pak Ketua Tim (Demo)", "KETUA_TIM", "Ketua Tim Produksi");
  const pegawai = [
    await mk("199001012015011001", "Yul Pegawai (Demo)", "PEGAWAI", "Statistisi"),
    await mk("199002012015011002", "Rina Pegawai (Demo)", "PEGAWAI", "Statistisi"),
    await mk("199003012015011003", "Dewi Pegawai (Demo)", "PEGAWAI", "Pranata Komputer"),
  ];

  const tahun = 2026;
  const periode =
    (await prisma.periode.findFirst({ where: { tahun, bulan: 10 } })) ??
    (await prisma.periode.create({ data: { tahun, bulan: 10, tanggalMulai: d("2026-10-01"), tanggalSelesai: d("2026-10-31"), status: "AKTIF", jumlahHariKerja: 22 } }));
  const tim = await prisma.timKerja.create({ data: { nama: TIM, tahun, ketuaId: ketua.id } });
  for (const u of [ketua, ...pegawai]) {
    await prisma.anggotaTim.create({ data: { timId: tim.id, userId: u.id, periodeId: periode.id, peranDalamTim: u.id === ketua.id ? "KETUA" : "ANGGOTA" } });
  }

  const buatAlokasi = (judul: string, satuan: string, target: number, bagi: number[]) =>
    prisma.alokasi.create({
      data: {
        periodeId: periode.id,
        timId: tim.id,
        judul,
        deskripsi: `${judul} periode Oktober 2026`,
        tanggalMulai: d("2026-10-01"),
        tanggalSelesai: d("2026-10-30"),
        targetVolume: target,
        satuan,
        prioritas: "TINGGI",
        dibuatOlehId: ketua.id,
        penugasan: { create: pegawai.map((u, i) => ({ userId: u.id, targetVolume: bagi[i] })) },
      },
      include: { penugasan: true },
    });
  const sakernas = await buatAlokasi("Entri data Sakernas", "dokumen", 90, [30, 30, 30]);
  const susenas = await buatAlokasi("Pengolahan Susenas", "blok sensus", 45, [15, 15, 15]);

  // Entri per hari kerja 1-8 Oktober; status verifikasi bervariasi agar semua tampilan punya isi.
  const hari = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
  let n = 0;
  for (const [i, u] of pegawai.entries()) {
    for (const tanggal of hari) {
      for (const al of [sakernas, susenas]) {
        n++;
        const pen = al.penugasan.find((p) => p.userId === u.id)!;
        const status = n % 7 === 0 ? "MENUNGGU" : n % 11 === 0 ? "MINTA_REVISI" : n % 13 === 0 ? "DITOLAK" : tanggal >= "2026-10-07" ? "MENUNGGU" : "DISETUJUI";
        const e = await prisma.pekerjaanHarian.create({
          data: {
            periodeId: periode.id,
            penugasanId: pen.id,
            userId: u.id,
            tanggal: d(tanggal),
            deskripsiCapaian: `${al.judul}: batch ${n}`,
            volume: 2 + ((n + i) % 4),
            satuan: al.satuan,
            status: "SELESAI",
            statusVerifikasi: status,
          },
        });
        if (status !== "MENUNGGU") {
          await prisma.verifikasi.create({
            data: {
              pekerjaanHarianId: e.id,
              verifikatorId: ketua.id,
              aksi: status === "DISETUJUI" ? "SETUJUI" : status === "MINTA_REVISI" ? "MINTA_REVISI" : "TOLAK",
              catatan: status === "DISETUJUI" ? null : "Mohon periksa kembali volume dan lampirkan bukti yang jelas.",
            },
          });
        }
      }
    }
  }
  await recalculateSemua();
  console.log(`seed-demo: selesai (${n} entri). Login: NIP pimpinan ${pimpinan.nip}, ketua ${ketua.nip}, pegawai ${pegawai[0].nip}; password ${PASSWORD_DEMO}`);
}

main().finally(() => prisma.$disconnect());
