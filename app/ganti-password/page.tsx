"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "../auth-shell";
import { PasswordField } from "../password-field";

export default function GantiPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    if (f.get("passwordBaru") !== f.get("konfirmasi")) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/me/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passwordLama: f.get("passwordLama"), passwordBaru: f.get("passwordBaru") }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(body.pesan ?? "Gagal mengganti password.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <AuthShell judul="Ganti password" keterangan="Minimal 8 karakter dan berbeda dari 3 password terakhir.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <PasswordField name="passwordLama" label="Password lama (atau sementara)" autoComplete="current-password" />
        <PasswordField name="passwordBaru" label="Password baru" autoComplete="new-password" minLength={8} />
        <PasswordField name="konfirmasi" label="Ulangi password baru" autoComplete="new-password" minLength={8} />
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
            {error}
          </p>
        )}
        <button disabled={loading} className="btn btn-primary mt-1 min-h-12 text-base">
          {loading ? "Menyimpan..." : "Simpan password"}
        </button>
      </form>
    </AuthShell>
  );
}
