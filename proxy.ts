import NextAuth from "next-auth";
import type { NextFetchEvent, NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

// Next 16: "proxy" menggantikan konvensi middleware. Memanggil auth() di sini menerbitkan ulang
// cookie sesi (menggeser idle timeout); otorisasi tetap dilakukan di tiap halaman/route.
const { auth } = NextAuth(authConfig);
const segarkanSesi = auth(() => undefined);

export function proxy(request: NextRequest, event: NextFetchEvent) {
  return segarkanSesi(request, event as never);
}

export const config = {
  // Route unggah bukti dikecualikan: proxy menyalin body permintaan dengan batas 10 MB,
  // sehingga file mendekati batas 10 MB akan terpotong. Aktivitas lain tetap menyegarkan sesi.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/pekerjaan-harian/[^/]+/bukti|api/event/[^/]+/lampiran|api/bukti/[^/]+$|.*\\..*).*)",
  ],
};
