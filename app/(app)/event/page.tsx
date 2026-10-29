import { redirect } from "next/navigation";
import { hariIni } from "@/lib/clock";
import { daftarEvent } from "@/lib/event";
import { listEventQuery } from "@/lib/event-schema";
import { HttpError, requireRole } from "@/lib/rbac";
import { Halaman, PageHeader } from "../../ui/primitives";
import { EventClient } from "./event-client";

export const dynamic = "force-dynamic";

export default async function EventPage({ searchParams }: { searchParams: Promise<{ baru?: string }> }) {
  let user;
  try {
    user = await requireRole("PEGAWAI", "KETUA_TIM");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    return (
      <Halaman lebar="max-w-xl">
        <PageHeader judul="Akses ditolak" keterangan="Halaman ini untuk pegawai dan ketua tim." />
      </Halaman>
    );
  }
  const { baru } = await searchParams;
  // Data awal dirender server; klien hanya memuat ulang setelah ada perubahan.
  const awal = JSON.parse(JSON.stringify(await daftarEvent(user, listEventQuery.parse({}))));
  return <EventClient awal={awal} hariIni={hariIni()} ketua={user.role === "KETUA_TIM"} bukaForm={baru === "1"} />;
}
