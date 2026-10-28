"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** Ganti periode profil lewat URL (?periodeId=), sehingga tautan dapat dibagikan dan tombol Kembali bekerja. */
export function PilihPeriode({ nilai, opsi }: { nilai: string; opsi: { id: string; tahun: number; bulan: number }[] }) {
  const router = useRouter();
  const [sibuk, mulai] = useTransition();
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-ink-muted">
      Periode
      <select
        value={nilai}
        aria-busy={sibuk}
        onChange={(e) => {
          const u = new URL(window.location.href);
          u.searchParams.set("periodeId", e.target.value);
          mulai(() => router.push(`${u.pathname}?${u.searchParams}`));
        }}
        className={`field min-w-44 text-sm ${sibuk ? "opacity-60" : ""}`}
      >
        {opsi.map((p) => (
          <option key={p.id} value={p.id}>
            {BULAN[p.bulan - 1]} {p.tahun}
          </option>
        ))}
      </select>
    </label>
  );
}
