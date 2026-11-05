"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

type Tema = "light" | "dark";
const KUNCI = "bps-tema";
const EVENT = "padeknian:tema";

/** Dipasang di <head> agar kelas tema sudah benar sebelum halaman tergambar (tanpa kedip). */
export const skripTema = `try{var t=localStorage.getItem("${KUNCI}");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

const Ctx = createContext<{ tema: Tema; gantiTema: () => void } | null>(null);

function langganan(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Sumber kebenaran = kelas `dark` pada <html> (dipasang skripTema sebelum hidrasi).
  const tema = useSyncExternalStore<Tema>(
    langganan,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light",
  );

  const gantiTema = useCallback(() => {
    const baru: Tema = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", baru === "dark");
    try {
      localStorage.setItem(KUNCI, baru);
    } catch {
      /* penyimpanan diblokir: tema tetap berlaku untuk sesi ini */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const value = useMemo(() => ({ tema, gantiTema }), [tema, gantiTema]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTema() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTema harus dipakai di dalam ThemeProvider");
  return c;
}
