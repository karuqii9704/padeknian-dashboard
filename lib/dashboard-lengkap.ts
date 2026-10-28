import { db } from "@/lib/db";
import { analitikDashboard } from "@/lib/dashboard-analitik";
import { ringkasanKpi, tentukanCakupan } from "@/lib/dashboard";
import { tabelPegawai, type PegawaiQuery } from "@/lib/dashboard-pegawai";
import type { SessionUser } from "@/lib/rbac";

/**
 * Seluruh isi dashboard dalam satu panggilan: cakupan (periode, tim, anggota) ditentukan SEKALI lalu
 * dipakai bersama oleh KPI, tabel pegawai, dan analitik yang berjalan paralel.
 * Filter `userId` hanya mempersempit tabel; KPI dan analitik tetap untuk seluruh cakupan tim.
 */
export async function dashboardLengkap(user: SessionUser, q: PegawaiQuery) {
  const c = await tentukanCakupan(user, q);
  if (!c) return null;
  const tim = await db.timKerja.findMany({ where: { id: { in: c.timIds } }, select: { id: true, nama: true }, orderBy: { nama: "asc" } });
  const [ringkasan, tabel, analitik] = await Promise.all([ringkasanKpi(user, q, c), tabelPegawai(user, q, c), analitikDashboard(c, tim)]);
  return { ringkasan: ringkasan!, tabel: tabel!, analitik };
}

export type DashboardLengkap = NonNullable<Awaited<ReturnType<typeof dashboardLengkap>>>;

/** Opsi filter (periode & tim) untuk peran ini; ketua hanya melihat tim yang dipimpinnya. */
export async function opsiFilterDashboard(user: SessionUser) {
  const [periode, tim] = await Promise.all([
    db.periode.findMany({ select: { id: true, tahun: true, bulan: true, status: true }, orderBy: [{ tahun: "desc" }, { bulan: "desc" }] }),
    db.timKerja.findMany({
      where: user.role === "KETUA_TIM" ? { ketuaId: user.id } : undefined,
      select: { id: true, nama: true },
      orderBy: { nama: "asc" },
    }),
  ]);
  return { periode, tim };
}
