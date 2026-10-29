import { redirect } from "next/navigation";
import { HttpError, requireSession } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Halaman awal sesuai peran: pegawai dan ketua tim ke Beranda, yang lain ke halaman pemantauannya.
export default async function Home() {
  let role;
  try {
    role = (await requireSession()).role;
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) redirect("/ganti-password");
    redirect("/login");
  }
  if (role === "ADMIN") redirect("/admin/pengguna");
  if (role === "PIMPINAN") redirect("/dashboard");
  redirect("/beranda");
}
