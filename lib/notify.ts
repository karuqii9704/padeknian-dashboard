import type { AksiVerifikasi, Prisma, TipeNotifikasi } from "@prisma/client";
import { db } from "@/lib/db";
import { labelTanggal } from "@/lib/tanggal-id";

type Client = Prisma.TransactionClient | typeof db;

export type NotifBaru = { userId: string; tipe: TipeNotifikasi; judul: string; isi: string; link?: string | null };

/** Satu-satunya jalur membuat notifikasi in-app. Boleh dipanggil di dalam transaksi. */
export async function buatNotifikasi(client: Client, items: NotifBaru[]) {
  if (items.length === 0) return;
  await client.notifikasi.createMany({
    data: items.map((n) => ({ userId: n.userId, tipe: n.tipe, judul: n.judul, isi: n.isi, link: n.link ?? null })),
  });
}

/** Isi notifikasi untuk pegawai ketika status verifikasi catatannya berubah (memuat catatan verifikator). */
export function susunNotifVerifikasi(o: {
  aksi: AksiVerifikasi;
  verifikator: string;
  kegiatan: string;
  tanggal: string; // YYYY-MM-DD
  catatan?: string | null;
}): Omit<NotifBaru, "userId"> {
  const cat = o.catatan ? ` Catatan: ${o.catatan}` : "";
  const dasar = `Catatan "${o.kegiatan}" tanggal ${labelTanggal(o.tanggal)}`;
  if (o.aksi === "SETUJUI") {
    return {
      tipe: "VERIFIKASI",
      judul: "Catatan disetujui",
      isi: `${dasar} disetujui oleh ${o.verifikator}.${cat}`,
      link: `/kalender?tanggal=${o.tanggal}`,
    };
  }
  return {
    tipe: "REVISI",
    judul: o.aksi === "TOLAK" ? "Catatan ditolak" : "Catatan perlu direvisi",
    isi: `${dasar} ${o.aksi === "TOLAK" ? "ditolak" : "diminta revisi"} oleh ${o.verifikator}.${cat}`,
    link: "/revisi",
  };
}
