"use client";

import { useEffect } from "react";
import Link from "next/link";
import { IkonKiri, IkonRefresh } from "@/app/ui/icons";


export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="text-center space-y-6 animate-masuk">
        <div className="flex size-16 items-center justify-center rounded-full bg-red-100 mx-auto">
          <svg
            className="h-8 w-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Terjadi kesalahan</h1>
        <p className="max-w-sm mx-auto text-muted-foreground">
          Maaf, terjadi kesalahan tak terduga. Silakan coba muat ulang halaman atau kembali ke beranda.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 btn btn-primary"
            aria-label="Muat ulang halaman"
          >
            <IkonRefresh className="h-4 w-4" />
            Coba lagi
          </button>
          <Link href="/" className="inline-flex items-center gap-2 btn btn-secondary">
            <IkonKiri className="h-4 w-4" />
            Kembali ke beranda
          </Link>
        </div>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}