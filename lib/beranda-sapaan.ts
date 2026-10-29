/** Salam sesuai jam (0-23): pagi 4-10, siang 11-14, sore 15-17, malam selebihnya. */
export function sapaan(jam: number) {
  if (jam >= 4 && jam <= 10) return "Selamat pagi";
  if (jam >= 11 && jam <= 14) return "Selamat siang";
  if (jam >= 15 && jam <= 17) return "Selamat sore";
  return "Selamat malam";
}

/** Jam saat ini (0-23) di zona Asia/Jakarta, dihitung di server agar tidak ada selisih hidrasi. */
export function jamJakarta(sekarang = new Date()) {
  const bagian = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "numeric", hourCycle: "h23" }).format(sekarang);
  return Number(bagian);
}

/** Nama panggilan dari nama lengkap: kata pertama tanpa gelar di belakang koma ("Agus Setiawan, S.ST." -> "Agus"). */
export function namaDepan(nama: string) {
  const tanpaGelar = nama.split(",")[0].trim();
  return tanpaGelar.split(/\s+/)[0] || nama;
}
