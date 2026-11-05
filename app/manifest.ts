import type { MetadataRoute } from "next";

// PWA: dapat dipasang di HP (layar utama) dan menampilkan halaman offline tanpa jaringan.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pekerjaan Harian BPS Kerinci",
    short_name: "Padeknian",
    description: "Pencatatan pekerjaan harian dan rekap SKP pegawai BPS Kabupaten Kerinci",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Catat pekerjaan", url: "/hari-ini?catat=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Lapor event", url: "/event?baru=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
