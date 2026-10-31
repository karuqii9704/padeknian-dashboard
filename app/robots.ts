import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      disallow: ["/api/", "/admin/", "/dashboard/", "/verifikasi/", "/rekap/", "/alokasi/"],
      allow: ["/", "/login", "/ganti-password"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}