import { redirect } from "next/navigation";
import { HttpError, requireSession } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Beranda: arahkan ke halaman awal sesuai peran.
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
  redirect("/hari-ini");
}
