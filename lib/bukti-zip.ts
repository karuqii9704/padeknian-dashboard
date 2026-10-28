import { once } from "node:events";
import { PassThrough } from "node:stream";
import { ZipArchive } from "archiver";
import { db } from "@/lib/db";
import { tulisAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { HttpError, type SessionUser } from "@/lib/rbac";
import { getObjectStream, putObjectStream, signedDownloadUrl } from "@/lib/storage";
import { namaFileAman } from "@/lib/xlsx-aman";
import { buatManifestCsv, pesanZipTerlaluBesar, susunJalurZip, type BarisManifest } from "@/lib/bukti-zip-susun";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const ZIP_MIME = "application/zip";
const tgl = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Susun ZIP seluruh bukti dukung seorang pegawai pada satu periode, simpan di storage privat,
 * dan kembalikan signed URL (<= 15 menit). Struktur: `<akar>/<tanggal>/<alokasi>/<berkas>` + `_daftar-bukti.csv`.
 * Hanya Admin/Pimpinan (dijaga pada route).
 */
export async function buatZipBukti(user: SessionUser, periodeId: string, userId: string, ip: string | null) {
  const [periode, pegawai] = await Promise.all([
    db.periode.findUnique({ where: { id: periodeId } }),
    db.user.findUnique({ where: { id: userId }, select: { id: true, nama: true } }),
  ]);
  if (!periode) throw new HttpError(404, "Periode tidak ditemukan.");
  if (!pegawai) throw new HttpError(404, "Pegawai tidak ditemukan.");

  const bukti = await db.buktiDukung.findMany({
    where: { pekerjaanHarian: { periodeId, userId } },
    orderBy: [{ pekerjaanHarian: { tanggal: "asc" } }, { uploadedAt: "asc" }],
    include: { pekerjaanHarian: { select: { tanggal: true, deskripsiCapaian: true, statusVerifikasi: true, isAdHoc: true, judulAdHoc: true, penugasan: { select: { alokasi: { select: { judul: true } } } } } } },
  });
  if (bukti.length === 0) throw new HttpError(404, "Pegawai ini belum memiliki bukti dukung pada periode tersebut.");

  const total = bukti.reduce((s, b) => s + Number(b.ukuranBytes), 0);
  const tolak = pesanZipTerlaluBesar(total);
  if (tolak) throw new HttpError(413, tolak);

  const periodeTeks = `${BULAN[periode.bulan - 1]}-${periode.tahun}`;
  const akar = `Bukti-${pegawai.nama}-${periodeTeks}`;
  const kegiatanDari = (b: (typeof bukti)[number]) => {
    const p = b.pekerjaanHarian;
    return p.isAdHoc ? `Tugas Tambahan - ${p.judulAdHoc ?? "tanpa judul"}` : (p.penugasan?.alokasi.judul ?? "Tanpa alokasi");
  };
  const jalur = susunJalurZip(
    akar,
    bukti.map((b) => ({ buktiId: b.id, tanggal: tgl(b.pekerjaanHarian.tanggal), kegiatan: kegiatanDari(b), namaFile: b.namaAsli })),
  );

  const key = `ekspor/zip/${periodeId}/${userId}.zip`;
  const arsip = new ZipArchive({ zlib: { level: 6 } });
  const keluar = new PassThrough();
  arsip.pipe(keluar);
  const unggah = putObjectStream(key, keluar, ZIP_MIME);
  const galat = new Promise<never>((_, tolakJanji) => {
    arsip.on("error", tolakJanji);
    keluar.on("error", tolakJanji);
  });
  galat.catch(() => undefined);

  const manifest: BarisManifest[] = [];
  const proses = (async () => {
    for (const b of bukti) {
      const p = b.pekerjaanHarian;
      const baris: BarisManifest = {
        jalur: jalur.get(b.id)!,
        tanggal: tgl(p.tanggal),
        kegiatan: kegiatanDari(b),
        deskripsi: p.deskripsiCapaian,
        statusVerifikasi: p.statusVerifikasi,
        ukuranBytes: Number(b.ukuranBytes),
        checksumSha256: b.checksumSha256,
      };
      try {
        const isi = await getObjectStream(b.objectKey);
        const selesai = once(arsip, "entry");
        arsip.append(isi, { name: baris.jalur });
        await selesai;
      } catch (e) {
        logger.warn({ err: e, buktiId: b.id }, "objek bukti tidak dapat dibaca saat menyusun ZIP");
        baris.catatan = "Berkas tidak ditemukan di penyimpanan; tidak disertakan.";
      }
      manifest.push(baris);
    }
    arsip.append(Buffer.from(buatManifestCsv(manifest), "utf8"), { name: `${akar}/_daftar-bukti.csv` });
    await arsip.finalize();
    await unggah;
  })();

  try {
    await Promise.race([proses, galat]);
  } catch (e) {
    arsip.abort();
    keluar.destroy();
    throw e;
  }

  await tulisAudit({
    userId: user.id,
    aksi: "UNDUH_ZIP_BUKTI",
    entitas: "Periode",
    entitasId: periodeId,
    metadata: { pegawaiId: userId, jumlahBerkas: bukti.length, totalBytes: total },
    ipAddress: ip,
  });
  return signedDownloadUrl(key, { namaFile: namaFileAman(`${akar}.zip`), contentType: ZIP_MIME, inline: false });
}
