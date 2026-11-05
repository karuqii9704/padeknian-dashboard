import { forbidden, redirect } from "next/navigation";
import { HttpError, requireRole } from "@/lib/rbac";
import { antreanVerifikasi } from "@/lib/verifikasi";

import { VerifikasiClient } from "./verifikasi-client";

export const dynamic = "force-dynamic";

export default async function VerifikasiPage() {
  let user;
  try {
    user = await requireRole("KETUA_TIM");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    forbidden(); // HTTP 403 + app/(app)/forbidden.tsx
  }
  const awal = JSON.parse(JSON.stringify(await antreanVerifikasi(user, { page: 1, pageSize: 100 })));
  return <VerifikasiClient awal={{ rows: awal.data, total: awal.total }} />;
}
