import type { NextConfig } from "next";

// Header keamanan dasar untuk semua respons. CSP penuh sengaja tidak dipasang (Next menyisipkan skrip inline);
// `frame-ancestors` cukup untuk mencegah clickjacking.
const headerKeamanan = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...((process.env.NEXTAUTH_URL ?? "").startsWith("https://")
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Standalone hanya untuk image Docker (Dockerfile mengisi NEXT_OUTPUT); `next start` biasa tidak cocok dengannya.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  serverExternalPackages: ["pino", "@prisma/client", "pg-boss", "exceljs", "archiver", "@react-pdf/renderer"],
  async headers() {
    return [
      { source: "/:path*", headers: headerKeamanan },
      // Service worker harus selalu diperiksa ulang agar pembaruan cepat sampai ke perangkat.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
