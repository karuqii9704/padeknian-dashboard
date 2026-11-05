// Tanpa "use client": dipakai halaman server (Tim Saya, baca saja) dan panel client (kelola anggota).

export type AnggotaBaris = { userId: string; nama: string; nip: string; peranDalamTim: "KETUA" | "ANGGOTA"; jabatan?: string | null };

/** Daftar anggota tim. Ketua ditandai teks + warna (garis kiri dan latar), akun yang sedang login ditandai "Anda". */
export function DaftarAnggota({
  anggota,
  penggunaId,
  aksi,
  kosong = "Belum ada anggota pada periode ini.",
}: {
  anggota: AnggotaBaris[];
  penggunaId?: string;
  aksi?: (a: AnggotaBaris) => React.ReactNode;
  kosong?: string;
}) {
  // Ketua selalu di atas, lalu anggota urut nama.
  const urut = [...anggota].sort((a, b) => (a.peranDalamTim === b.peranDalamTim ? a.nama.localeCompare(b.nama, "id") : a.peranDalamTim === "KETUA" ? -1 : 1));
  return (
    <ul className="space-y-1.5 text-sm">
      {urut.map((a) => {
        const ketua = a.peranDalamTim === "KETUA";
        const saya = a.userId === penggunaId;
        return (
          <li
            key={a.userId}
            data-anggota={a.userId}
            data-ketua={ketua || undefined}
            className={`flex items-center justify-between gap-3 rounded-lg border-l-4 px-3 py-2 ${
              ketua
                ? "border-l-amber-500 bg-amber-50 dark:border-l-amber-400 dark:bg-[#1a1200]"
                : saya
                  ? "border-l-brand-500 bg-brand-50/60 dark:bg-[#0a1a33]"
                  : "border-l-transparent bg-muted/50"
            }`}
          >
            <span className="min-w-0">
              <span className={`break-words ${ketua ? "font-semibold" : ""}`}>{a.nama}</span>{" "}
              <span className="text-ink-muted">({a.nip})</span>
              {a.jabatan && <span className="block text-xs text-ink-muted">{a.jabatan}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {ketua && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 dark:bg-[#2a1f00] dark:text-amber-200 dark:ring-amber-700">
                  Ketua tim
                </span>
              )}
              {saya && (
                <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800 dark:bg-[#0a1a33] dark:text-brand-200 dark:ring-1 dark:ring-brand-800">
                  Anda
                </span>
              )}
              {aksi?.(a)}
            </span>
          </li>
        );
      })}
      {anggota.length === 0 && <li className="py-2 text-ink-muted">{kosong}</li>}
    </ul>
  );
}
