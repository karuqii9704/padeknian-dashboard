"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "padeknian:penyimpanan";

function baca(kunci: string): string | null {
  try {
    return localStorage.getItem(kunci);
  } catch {
    return null; // penyimpanan diblokir (mode privat, kebijakan peramban)
  }
}

function langganan(cb: () => void) {
  window.addEventListener("storage", cb); // tab lain
  window.addEventListener(EVENT, cb); // tab ini
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/**
 * Nilai localStorage sebagai state React (useSyncExternalStore): server merender `null`, klien membaca
 * nilai tersimpan tanpa setState di efek. `simpan(null)` menghapus kunci. Gagal simpan diabaikan.
 */
export function usePenyimpananLokal(kunci: string) {
  const nilai = useSyncExternalStore(
    langganan,
    () => baca(kunci),
    () => null,
  );
  const simpan = useCallback(
    (v: string | null) => {
      try {
        if (v === null) localStorage.removeItem(kunci);
        else localStorage.setItem(kunci, v);
      } catch {
        /* abaikan */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [kunci],
  );
  return [nilai, simpan] as const;
}
