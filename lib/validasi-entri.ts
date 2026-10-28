import { isAkhirPekan } from "@/lib/kalender";

export const BATAS_BACKFILL_HARI = 3;

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export type PeriodeUntukValidasi = { status: "DRAFT" | "AKTIF" | "DIKUNCI"; tanggalMulai: string; tanggalSelesai: string };

export type HasilValidasi =
  | { ok: true; isBackfill: boolean }
  | { ok: false; status: 400 | 409; pesan: string };

const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** Selisih hari kalender (a - b) untuk tanggal "YYYY-MM-DD". */
export function selisihHari(a: string, b: string) {
  return Math.round((d(a).getTime() - d(b).getTime()) / 86_400_000);
}

/**
 * Validasi tanggal entri harian (FR-20), murni agar mudah diuji.
 * Urutan: masa depan -> akhir pekan -> hari libur -> status/rentang periode -> batas backfill.
 */
export function validasiTanggalEntri(input: {
  tanggal: string;
  hariIni: string;
  periode: PeriodeUntukValidasi;
  /** tanggal libur -> keterangan */
  libur: ReadonlyMap<string, string>;
}): HasilValidasi {
  const { tanggal, hariIni, periode, libur } = input;

  if (tanggal > hariIni) return { ok: false, status: 400, pesan: "Tanggal tidak boleh di masa depan." };

  if (isAkhirPekan(d(tanggal))) {
    const nama = HARI[d(tanggal).getUTCDay()];
    return {
      ok: false,
      status: 400,
      pesan: `${nama}, ${tanggal} adalah akhir pekan. Pekerjaan hanya dapat dicatat pada hari kerja.`,
    };
  }

  const ket = libur.get(tanggal);
  if (ket !== undefined) {
    return {
      ok: false,
      status: 400,
      pesan: `${tanggal} adalah hari libur (${ket}). Pekerjaan hanya dapat dicatat pada hari kerja.`,
    };
  }

  if (periode.status === "DIKUNCI") {
    return { ok: false, status: 409, pesan: "Periode sudah dikunci; entri tidak dapat dibuat atau diubah." };
  }
  if (tanggal < periode.tanggalMulai || tanggal > periode.tanggalSelesai) {
    return { ok: false, status: 400, pesan: "Tanggal berada di luar rentang periode." };
  }
  if (periode.status !== "AKTIF") {
    return { ok: false, status: 400, pesan: "Periode belum diaktifkan. Entri hanya dapat dicatat pada periode aktif." };
  }

  const mundur = selisihHari(hariIni, tanggal);
  if (mundur > BATAS_BACKFILL_HARI) {
    return {
      ok: false,
      status: 400,
      pesan: `Pencatatan mundur maksimal ${BATAS_BACKFILL_HARI} hari kalender. Tanggal paling lama yang diterima: ${tambahHari(hariIni, -BATAS_BACKFILL_HARI)}.`,
    };
  }
  return { ok: true, isBackfill: mundur > 0 };
}

export function tambahHari(iso: string, n: number) {
  return new Date(d(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}
