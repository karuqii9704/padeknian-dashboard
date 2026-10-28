"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAKS_FILE_PER_ENTRI } from "@/lib/bukti-batas";
import { kompresGambar, periksaFileLokal, unggahDenganProgres } from "@/lib/bukti-klien";

export type ItemBukti = {
  key: string;
  file: File;
  status: "siap" | "mengunggah" | "selesai" | "gagal";
  progress: number;
  pesan?: string;
  previewUrl?: string;
};

/**
 * Antrean bukti di sisi klien: pilih -> (kompres) -> unggah satu per satu dengan progres.
 * Aman diulang: file yang sudah terunggah dilewati, dan server menganggap file kembar sebagai sukses.
 */
export function useAntreanBukti(jumlahSudahAda = 0) {
  const [items, setItems] = useState<ItemBukti[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const ref = useRef<ItemBukti[]>([]);
  ref.current = items;

  const ubah = useCallback((key: string, patch: Partial<ItemBukti>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }, []);

  useEffect(
    () => () => {
      for (const i of ref.current) if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    },
    [],
  );

  const tambah = useCallback(
    async (daftar: FileList | File[]) => {
      setGalat(null);
      const baru: ItemBukti[] = [];
      const pesanGalat: string[] = [];
      for (const asli of Array.from(daftar)) {
        const sudah = jumlahSudahAda + ref.current.length + baru.length;
        const g = periksaFileLokal(asli, sudah);
        if (g) {
          pesanGalat.push(`${asli.name}: ${g}`);
          continue;
        }
        const file = await kompresGambar(asli);
        if (file.size > 10 * 1024 * 1024) {
          pesanGalat.push(`${asli.name}: Ukuran file melebihi batas 10 MB.`);
          continue;
        }
        baru.push({
          key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          status: "siap",
          progress: 0,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        });
      }
      if (baru.length) setItems((prev) => [...prev, ...baru]);
      if (pesanGalat.length) setGalat(pesanGalat.join(" "));
    },
    [jumlahSudahAda],
  );

  const hapus = useCallback((key: string) => {
    setItems((prev) => {
      const t = prev.find((i) => i.key === key);
      if (t?.previewUrl) URL.revokeObjectURL(t.previewUrl);
      return prev.filter((i) => i.key !== key);
    });
  }, []);

  /** Unggah semua yang belum selesai ke entri tertentu. Mengembalikan true bila tidak ada yang gagal. */
  const unggahSemua = useCallback(
    async (entriId: string) => {
      let semuaOk = true;
      for (const item of ref.current) {
        if (item.status === "selesai") continue;
        ubah(item.key, { status: "mengunggah", progress: 0, pesan: undefined });
        const r = await unggahDenganProgres(entriId, item.file, (p) => ubah(item.key, { progress: p }));
        if (r.ok) ubah(item.key, { status: "selesai", progress: 100 });
        else {
          semuaOk = false;
          ubah(item.key, { status: "gagal", pesan: r.pesan });
        }
      }
      return semuaOk;
    },
    [ubah],
  );

  return {
    items,
    galat,
    tambah,
    hapus,
    unggahSemua,
    sisaKuota: Math.max(0, MAKS_FILE_PER_ENTRI - jumlahSudahAda - items.length),
    adaBelumSelesai: items.some((i) => i.status !== "selesai"),
    sedangMengunggah: items.some((i) => i.status === "mengunggah"),
    adaGagal: items.some((i) => i.status === "gagal"),
  };
}

export type AntreanBukti = ReturnType<typeof useAntreanBukti>;
