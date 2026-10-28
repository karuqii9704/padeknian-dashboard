import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Memanggil auth() di middleware menerbitkan ulang cookie sesi (menggeser idle timeout).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Route unggah bukti dikecualikan: middleware menyalin body permintaan dengan batas 10 MB,
  // sehingga file mendekati batas 10 MB akan terpotong. Aktivitas lain tetap menyegarkan sesi.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/pekerjaan-harian/[^/]+/bukti|api/bukti/[^/]+$|.*\\..*).*)"],
};
