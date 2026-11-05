// Murni (aman diimpor dari komponen client).

/** Peran yang mencatat pekerjaan harian. Admin dan Pimpinan tidak diwajibkan mengisi. */
export const PERAN_WAJIB_LAPOR = ["PEGAWAI", "KETUA_TIM"] as const;

/** Akun yang diharapkan mengisi catatan: aktif dan berperan Pegawai/Ketua Tim. */
export function wajibLapor(u: { role: string; isActive: boolean }) {
  return u.isActive && (PERAN_WAJIB_LAPOR as readonly string[]).includes(u.role);
}
