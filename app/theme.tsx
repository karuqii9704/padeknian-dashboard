"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Tema = "light" | "dark";
const KUNCI = "bps-tema";

/** Dipasang di <head> agar kelas tema sudah benar sebelum halaman tergambar (tanpa kedip). */
export const skripTema = `try{var t=localStorage.getItem("${KUNCI}");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

const Ctx = createContext<{ tema: Tema; gantiTema: () => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [tema, setTema] = useState<Tema>("light");

  useEffect(() => {
    setTema(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const gantiTema = useCallback(() => {
    setTema((t) => {
      const baru = t === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", baru === "dark");
      try {
        localStorage.setItem(KUNCI, baru);
      } catch {
        /* penyimpanan diblokir: tema tetap berlaku untuk sesi ini */
      }
      return baru;
    });
  }, []);

  const value = useMemo(() => ({ tema, gantiTema }), [tema, gantiTema]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTema() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTema harus dipakai di dalam ThemeProvider");
  return c;
}
