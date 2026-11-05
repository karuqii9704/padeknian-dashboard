// Murni (tanpa DB) agar mudah diuji dan aman diimpor dari client.

export type BarisKecepatanTim = {
  timId: string;
  nama: string;
  ketua: string;
  /** Catatan anggota yang masih MENUNGGU verifikasi. */
  menunggu: number;
  /** Median lama menunggu (jam) catatan yang masih antre. */
  medianTungguJam: number | null;
  /** Catatan antre paling lama (jam). */
  tertuaJam: number | null;
  /** Median waktu dari catatan dibuat sampai verifikasi pertama (jam). */
  medianSelesaiJam: number | null;
  jumlahSelesai: number;
};

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Jam -> teks singkat ("40 mnt", "5 jam", "2,5 hari"). */
export function teksDurasi(jam: number | null) {
  if (jam === null) return "–";
  if (jam < 1) return `${Math.max(1, Math.round(jam * 60))} mnt`;
  if (jam < 24) return `${Math.round(jam)} jam`;
  return `${String(Math.round((jam / 24) * 10) / 10).replace(".", ",")} hari`;
}

/**
 * Agregasi per tim. Catatan seorang anggota dihitung untuk setiap tim tempat ia menjadi anggota
 * pada periode itu (sesuai wewenang verifikasi: ketua tim mana pun dari timnya).
 */
export function hitungKecepatan(input: {
  tim: { id: string; nama: string; ketua: string }[];
  anggota: { timId: string; userId: string }[];
  menunggu: { userId: string; jam: number }[];
  selesai: { userId: string; jam: number }[];
}) {
  const timPerUser = new Map<string, string[]>();
  for (const a of input.anggota) timPerUser.set(a.userId, [...new Set([...(timPerUser.get(a.userId) ?? []), a.timId])]);
  const kumpul = (rows: { userId: string; jam: number }[]) => {
    const m = new Map<string, number[]>();
    for (const r of rows) for (const t of timPerUser.get(r.userId) ?? []) m.set(t, [...(m.get(t) ?? []), r.jam]);
    return m;
  };
  const tunggu = kumpul(input.menunggu);
  const selesai = kumpul(input.selesai);
  const perTim: BarisKecepatanTim[] = input.tim
    .map((t) => {
      const w = tunggu.get(t.id) ?? [];
      const s = selesai.get(t.id) ?? [];
      return {
        timId: t.id,
        nama: t.nama,
        ketua: t.ketua,
        menunggu: w.length,
        medianTungguJam: median(w),
        tertuaJam: w.length ? Math.max(...w) : null,
        medianSelesaiJam: median(s),
        jumlahSelesai: s.length,
      };
    })
    .sort((a, b) => b.menunggu - a.menunggu || (b.tertuaJam ?? 0) - (a.tertuaJam ?? 0) || a.nama.localeCompare(b.nama, "id"));
  const semuaTunggu = input.menunggu.map((r) => r.jam);
  return {
    ringkas: {
      menunggu: semuaTunggu.length,
      medianTungguJam: median(semuaTunggu),
      tertuaJam: semuaTunggu.length ? Math.max(...semuaTunggu) : null,
      medianSelesaiJam: median(input.selesai.map((r) => r.jam)),
      jumlahSelesai: input.selesai.length,
    },
    perTim,
  };
}

export type KecepatanVerifikasi = ReturnType<typeof hitungKecepatan>;
