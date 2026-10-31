"use client";

import Link from "next/link";
import { IkonKiri } from "@/app/ui/icons";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="text-center space-y-6 animate-masuk">
        <p className="text-9xl font-medium tracking-tight text-brand-200/60">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
        <p className="max-w-sm mx-auto text-muted-foreground">
          Maaf, halaman yang Anda cari tidak ada atau sudah dipindahkan.
        </p>
        <Link href="/" className="inline-flex items-center gap-2 btn btn-primary">
          <IkonKiri className="h-4 w-4" />
          Kembali ke beranda
        </Link>
      </div>
    </main>
  );
}