// Data uji E2E. Password ini hanya untuk database *e2e* lokal.
export const E2E_PASSWORD = "Password-123";

export const USERS = {
  admin: { nip: "198001012005011001", nama: "Admin E2E", role: "ADMIN" },
  ketua: { nip: "197001012000011001", nama: "Pak R Ketua", role: "KETUA_TIM" },
  yul: { nip: "199001012015011001", nama: "Yul Pegawai", role: "PEGAWAI" },
  rina: { nip: "199002012015011002", nama: "Rina Pegawai", role: "PEGAWAI" },
  dewi: { nip: "199003012015011003", nama: "Dewi Pegawai", role: "PEGAWAI" },
  ketua2: { nip: "197102012000011002", nama: "Bu S Ketua", role: "KETUA_TIM" },
  sari: { nip: "199005012015011005", nama: "Sari Pegawai", role: "PEGAWAI" },
  tari: { nip: "199004012015011004", nama: "Tari Pegawai", role: "PEGAWAI" },
  pimpinan: { nip: "196501012000011001", nama: "Bu K Pimpinan", role: "PIMPINAN" },
} as const;

// NIP yang sengaja digagalkan oleh worker uji (REKAP_GAGALKAN_NIP) untuk menguji penanganan job gagal.
export const NIP_GAGAL = "199777777777777777";

export const TIM_NAMA = "Tim Statistik Produksi";
// Diurutkan setelah TIM_NAMA agar spec lama yang memakai tim pertama tidak terpengaruh.
export const TIM2_NAMA = "Tim Umum";

// Jam sistem palsu untuk E2E (diteruskan ke server lewat APP_FAKE_TODAY). Rabu.
// Okt 2026: Sabtu 10, Minggu 11, libur uji Kamis 8.
export const FAKE_TODAY = "2026-10-14";
export const LIBUR_UJI = { tanggal: "2026-10-08", keterangan: "Libur uji E2E" };
