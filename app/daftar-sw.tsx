"use client";

import { useEffect } from "react";

/** Daftarkan service worker (PWA) hanya di produksi agar tidak mengganggu hot reload saat pengembangan. */
export function DaftarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
