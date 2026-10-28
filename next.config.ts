import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone hanya untuk image Docker (Dockerfile mengisi NEXT_OUTPUT); `next start` biasa tidak cocok dengannya.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  serverExternalPackages: ["pino", "@prisma/client", "pg-boss", "exceljs", "archiver", "@react-pdf/renderer"],
};

export default nextConfig;
