"use client";

import { useId, useState } from "react";

type Props = { name: string; label: string; autoComplete: string; required?: boolean; minLength?: number };

/** Kolom password dengan tombol lihat/sembunyikan. Nama aksesibel tombol sengaja tanpa kata "password" agar label kolom tetap unik. */
export function PasswordField({ name, label, autoComplete, required = true, minLength }: Props) {
  const id = useId();
  const [lihat, setLihat] = useState(false);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} className="font-medium text-gray-800">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={lihat ? "text" : "password"}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          className="field pr-12"
        />
        <button
          type="button"
          onClick={() => setLihat((v) => !v)}
          aria-pressed={lihat}
          aria-label={lihat ? "Sembunyikan sandi" : "Tampilkan sandi"}
          title={lihat ? "Sembunyikan sandi" : "Tampilkan sandi"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r text-gray-500 transition-colors hover:text-blue-800"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {lihat ? (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.6 6.1A10.9 10.9 0 0 1 12 6c5 0 8.5 4 9.5 6a13.6 13.6 0 0 1-2.6 3.4M6.6 6.7C4.5 8.1 3.1 10.3 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </>
            ) : (
              <>
                <path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
