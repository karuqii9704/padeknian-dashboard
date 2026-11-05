import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16 menyediakan flat config langsung (tanpa FlatCompat).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Aturan baru React Compiler (eslint-plugin-react-hooks 7, ikut eslint-config-next 16). Proyek belum memakai
    // React Compiler; pola lama (memuat data/localStorage di efek) ditandai peringatan dan dirapikan bertahap.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/incompatible-library": "warn",
    },
  },
  globalIgnores(["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "playwright.local.config.ts"]),
]);
