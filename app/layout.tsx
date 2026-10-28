import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, skripTema } from "./theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard Pekerjaan Harian – BPS Kerinci",
  description: "Pencatatan pekerjaan harian dan rekap SKP pegawai BPS Kabupaten Kerinci",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: skripTema }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
