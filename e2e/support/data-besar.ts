import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { recalculateProgresAlokasi } from "../../lib/progres-alokasi";
import { E2E_PASSWORD } from "./data";

export const TIM_BESAR = "Tim Zeta Besar";

/** Hari kerja Oktober 2026 (Sen-Jum) selain libur uji 8 Okt, sampai FAKE_TODAY (14 Okt) + sisa bulan. */
export function hariKerjaOktober() {
  const out: string[] = [];
  for (let d = 1; d <= 30; d++) {
    const t = new Date(Date.UTC(2026, 9, d));
    const dow = t.getUTCDay();
    if (dow === 0 || dow === 6 || d === 8) continue;
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Data beban: 100 pegawai x hari kerja x 3 entri (~6.000+), sekitar 60% berbukti,
 * status verifikasi bervariasi. Dimasukkan langsung ke DB (melewati API) agar cepat.
 */
export async function isiDataBesar(prisma: PrismaClient, periodeId: string) {
  const hash = await bcrypt.hash(E2E_PASSWORD, 4);
  const ketua = await prisma.user.create({ data: { nip: "197999990000000001", nama: "Ketua Besar", role: "KETUA_TIM", passwordHash: hash } });
  const tim = await prisma.timKerja.create({ data: { nama: TIM_BESAR, tahun: 2026, ketuaId: ketua.id } });

  const pegawai = Array.from({ length: 100 }, (_, i) => ({
    id: randomUUID(),
    nip: `1980${String(i).padStart(14, "0")}`,
    nama: `Pegawai Besar ${String(i).padStart(3, "0")}`,
    role: "PEGAWAI" as const,
    passwordHash: hash,
  }));
  await prisma.user.createMany({ data: pegawai });
  await prisma.anggotaTim.createMany({
    data: [
      { timId: tim.id, userId: ketua.id, periodeId, peranDalamTim: "KETUA" as const },
      ...pegawai.map((p) => ({ timId: tim.id, userId: p.id, periodeId })),
    ],
  });

  const alokasiIds: string[] = [];
  const penugasan: { id: string; userId: string; alokasiId: string }[] = [];
  for (let a = 0; a < 5; a++) {
    const alokasi = await prisma.alokasi.create({
      data: {
        periodeId,
        timId: tim.id,
        judul: `Kegiatan besar ${a + 1}`,
        deskripsi: "beban",
        tanggalMulai: new Date("2026-10-01T00:00:00Z"),
        tanggalSelesai: new Date("2026-10-30T00:00:00Z"),
        targetVolume: 500,
        satuan: "dokumen",
        dibuatOlehId: ketua.id,
      },
    });
    alokasiIds.push(alokasi.id);
    for (const p of pegawai) penugasan.push({ id: randomUUID(), userId: p.id, alokasiId: alokasi.id });
  }
  await prisma.penugasanAlokasi.createMany({ data: penugasan.map((p) => ({ ...p, targetVolume: 100 })) });

  const status = ["MENUNGGU", "DISETUJUI", "DISETUJUI", "MINTA_REVISI", "DISETUJUI"] as const;
  const hari = hariKerjaOktober();
  const entri: Prisma.PekerjaanHarianCreateManyInput[] = [];
  const buktiUntuk: { pekerjaanHarianId: string; userId: string }[] = [];
  let n = 0;
  pegawai.forEach((p, pi) => {
    for (const tanggal of hari) {
      for (let k = 0; k < 3; k++) {
        const id = randomUUID();
        const pen = penugasan[(pi + k) % 5 * 100 + pi]; // penugasan milik pegawai ini pada alokasi (k%5)
        entri.push({
          id,
          periodeId,
          penugasanId: pen.id,
          userId: p.id,
          tanggal: new Date(`${tanggal}T00:00:00Z`),
          deskripsiCapaian: `Beban ${pi}-${tanggal}-${k}`,
          volume: 1 + (n % 4),
          satuan: "dokumen",
          statusVerifikasi: status[n % status.length],
        });
        if (n % 5 < 3) buktiUntuk.push({ pekerjaanHarianId: id, userId: p.id });
        n++;
      }
    }
  });
  for (let i = 0; i < entri.length; i += 1000) await prisma.pekerjaanHarian.createMany({ data: entri.slice(i, i + 1000) });
  for (let i = 0; i < buktiUntuk.length; i += 1000) {
    await prisma.buktiDukung.createMany({
      data: buktiUntuk.slice(i, i + 1000).map((b) => ({
        pekerjaanHarianId: b.pekerjaanHarianId,
        namaAsli: "beban.png",
        objectKey: `beban/${b.pekerjaanHarianId}.png`,
        mimeType: "image/png",
        ukuranBytes: BigInt(1000),
        checksumSha256: b.pekerjaanHarianId.replace(/-/g, "").padEnd(64, "0"),
        uploadedById: b.userId,
      })),
    });
  }
  for (const id of alokasiIds) await recalculateProgresAlokasi(id);

  return { timId: tim.id, ketuaNip: "197999990000000001", jumlahPegawai: pegawai.length, jumlahEntri: entri.length, jumlahBukti: buktiUntuk.length };
}

export function persentil(nilai: number[], p: number) {
  const s = [...nilai].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
