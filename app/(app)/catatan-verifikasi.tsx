type Terakhir = { aksi: string; catatan: string | null; verifikator: string; createdAt: string } | null;

/** Catatan ketua tim untuk entri yang perlu diperbaiki (dibaca pegawai tanpa harus bertanya lewat chat). */
export function CatatanVerifikasi({ terakhir, statusVerifikasi }: { terakhir: Terakhir; statusVerifikasi: string }) {
  if (!terakhir || (statusVerifikasi !== "MINTA_REVISI" && statusVerifikasi !== "DITOLAK")) return null;
  return (
    <div role="note" className="mt-2.5 rounded-lg border-l-[3px] border-red-500 bg-red-50/80 px-3 py-2 text-sm text-red-950">
      <p className="text-xs font-semibold">
        {terakhir.aksi === "TOLAK" ? "Ditolak" : "Diminta revisi"} oleh {terakhir.verifikator}
      </p>
      {terakhir.catatan && <p>{terakhir.catatan}</p>}
    </div>
  );
}
