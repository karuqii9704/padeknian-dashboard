import { forbidden, redirect } from "next/navigation";
import { HttpError, requireRole } from "@/lib/rbac";

/** Gerbang halaman admin: sesi tidak valid dialihkan; peran tidak cukup -> forbidden() (HTTP 403). */
export async function gerbangAdmin() {
  try {
    return await requireRole("ADMIN");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    forbidden();
  }
}
