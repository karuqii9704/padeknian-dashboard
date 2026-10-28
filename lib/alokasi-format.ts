const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const PRIORITAS_LABEL: Record<string, string> = { RENDAH: "Rendah", SEDANG: "Sedang", TINGGI: "Tinggi" };

export type AlokasiRingkas = {
  judul: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  satuan: string;
  prioritas: string;
  penugasan: { nama: string; targetVolume: string }[];
};

/** "2026-10-05" -> "5 Okt" (tanpa zona waktu). */
export function tanggalPendek(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1].slice(0, 3)}`;
}

/** Angka dari API ("60.00", "40.50") -> tampilan ringkas ("60", "40,5"). */
export function angkaRingkas(s: string) {
  return String(Number(s)).replace(".", ",");
}

/** Teks siap tempel ke grup WhatsApp (format tebal pakai *...*). */
export function formatDaftarWhatsApp(header: string, items: AlokasiRingkas[]) {
  if (items.length === 0) return `*${header}*\n(Belum ada alokasi)`;
  const baris = items.map((a, i) => {
    const penerima = a.penugasan.map((p) => `${p.nama} ${angkaRingkas(p.targetVolume)} ${a.satuan}`).join("; ");
    return `${i + 1}. ${a.judul}\n   ${penerima}\n   ${tanggalPendek(a.tanggalMulai)} – ${tanggalPendek(a.tanggalSelesai)} · Prioritas ${PRIORITAS_LABEL[a.prioritas] ?? a.prioritas}`;
  });
  return `*${header}*\n\n${baris.join("\n\n")}`;
}
