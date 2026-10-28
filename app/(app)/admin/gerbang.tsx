import { redirect } from "next/navigation";
import { HttpError, requireRole } from "@/lib/rbac";
import { Halaman, PageHeader } from "../../ui/primitives";

/** Gerbang halaman admin: null = peran tidak cukup (tampilkan <AksesDitolak />); sesi tidak valid dialihkan. */
export async function gerbangAdmin() {
  try {
    return await requireRole("ADMIN");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    return null;
  }
}

export function AksesDitolak() {
  return (
    <Halaman lebar="max-w-xl">
      <PageHeader judul="Akses ditolak" keterangan="Halaman ini hanya untuk Admin." />
    </Halaman>
  );
}
