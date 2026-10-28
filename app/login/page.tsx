"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { PasswordField } from "../password-field";

// Hanya identitas (NIP/email) yang diingat di perangkat; password tidak pernah disimpan. Sesi tetap mengikuti kebijakan keamanan.
const KUNCI_INGAT = "padeknian.ingat-identitas";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const idRef = useRef<HTMLInputElement>(null);
  const [ingat, setIngat] = useState(false);

  useEffect(() => {
    try {
      const tersimpan = localStorage.getItem(KUNCI_INGAT);
      if (tersimpan && idRef.current && !idRef.current.value) {
        idRef.current.value = tersimpan;
        setIngat(true);
      }
    } catch {
      /* penyimpanan lokal tidak tersedia: abaikan */
    }
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: f.get("identifier"), password: f.get("password") }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    try {
      if (res.ok && ingat) localStorage.setItem(KUNCI_INGAT, String(f.get("identifier") ?? ""));
      else if (res.ok) localStorage.removeItem(KUNCI_INGAT);
    } catch {
      /* abaikan */
    }
    if (!res.ok) {
      setError(body.pesan ?? "Login gagal. Coba lagi.");
      return;
    }
    router.push(body.mustChangePassword ? "/ganti-password" : "/");
    router.refresh();
  }

  return (
    <AuthShell judul="Masuk" keterangan="Dashboard Pekerjaan Harian &amp; Rekap SKP — BPS Kabupaten Kerinci">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-800">
          NIP atau email
          <input ref={idRef} name="identifier" required autoComplete="username" autoCapitalize="none" spellCheck={false} className="field font-normal" />
        </label>
        <PasswordField name="password" label="Password" autoComplete="current-password" />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={ingat} onChange={(e) => setIngat(e.target.checked)} className="h-4 w-4 accent-blue-700" />
          Ingat saya
          <span className="text-xs text-gray-500">(simpan NIP di perangkat ini)</span>
        </label>
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
            {error}
          </p>
        )}
        <button disabled={loading} className="btn btn-primary mt-1 min-h-12 text-base">
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>
    </AuthShell>
  );
}
