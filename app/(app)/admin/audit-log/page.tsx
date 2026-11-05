import Link from "next/link";
import { auditLogQuery, daftarAuditLog } from "@/lib/audit-log";
import { Alert, EmptyState, PageHeader } from "../../../ui/primitives";
import { AksesDitolak, gerbangAdmin } from "../gerbang";

export const dynamic = "force-dynamic";

const waktu = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" });
const labelAksi = (a: string) => a.charAt(0) + a.slice(1).toLowerCase().replace(/_/g, " ");
const NADA_AKSI: Record<string, string> = {
  LOGIN_GAGAL: "bg-red-50 text-red-800 dark:bg-[#1a0505] dark:text-red-200",
  RESET_PASSWORD: "bg-amber-50 text-amber-900 dark:bg-[#1a1200] dark:text-amber-200",
  UBAH_PERAN: "bg-amber-50 text-amber-900 dark:bg-[#1a1200] dark:text-amber-200",
  NONAKTIF_AKUN: "bg-amber-50 text-amber-900 dark:bg-[#1a1200] dark:text-amber-200",
  KUNCI_PERIODE: "bg-amber-50 text-amber-900 dark:bg-[#1a1200] dark:text-amber-200",
};

type Cari = Record<string, string | string[] | undefined>;

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Cari> }) {
  if (!(await gerbangAdmin())) return <AksesDitolak />;
  const sp = await searchParams;
  const mentah = Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
  const parsed = auditLogQuery.safeParse(mentah);
  const q = parsed.success ? parsed.data : auditLogQuery.parse({});
  const r = await daftarAuditLog(q);
  const jumlahHalaman = Math.max(1, Math.ceil(r.total / r.pageSize));
  const tautan = (page: number) => {
    const p = new URLSearchParams({ ...mentah, page: String(page) });
    return `/admin/audit-log?${p}`;
  };

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Keamanan"
        judul="Audit Log"
        keterangan="Jejak aksi penting: login, perubahan akun dan peran, reset password, verifikasi, alokasi, penguncian periode, dan unduhan arsip."
      />

      <form method="get" className="panel grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Pengguna
          <input name="q" type="search" defaultValue={q.q ?? ""} maxLength={120} placeholder="Nama, NIP, atau email" className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Aksi
          <select name="aksi" defaultValue={q.aksi ?? ""} className="field text-sm">
            <option value="">Semua aksi</option>
            {r.aksiTersedia.map((a) => (
              <option key={a} value={a}>{labelAksi(a)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Dari
          <input name="dari" type="date" defaultValue={q.dari ?? ""} className="field text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Sampai
          <input name="sampai" type="date" defaultValue={q.sampai ?? ""} className="field text-sm" />
        </label>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary">Terapkan</button>
          <Link href="/admin/audit-log" className="btn btn-secondary">Reset</Link>
        </div>
      </form>

      {!parsed.success && <Alert nada="galat">{parsed.error.issues[0]?.message ?? "Filter tidak valid."} Filter diabaikan.</Alert>}

      <p className="text-sm text-ink-muted" aria-live="polite">
        {r.total.toLocaleString("id-ID")} catatan{r.total > 0 && <> · halaman {r.page} dari {jumlahHalaman}</>}
      </p>

      <div className="overflow-x-auto rounded border">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b text-xs">
            <tr>
              <th scope="col" className="px-3 py-2.5">Waktu (WIB)</th>
              <th scope="col" className="px-3 py-2.5">Pengguna</th>
              <th scope="col" className="px-3 py-2.5">Aksi</th>
              <th scope="col" className="px-3 py-2.5">Objek</th>
              <th scope="col" className="px-3 py-2.5">IP</th>
              <th scope="col" className="px-3 py-2.5">Rincian</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.data.map((l) => (
              <tr key={l.id} data-audit={l.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{waktu(l.createdAt)}</td>
                <td className="px-3 py-2">
                  {l.user ? (
                    <>
                      {l.user.nama}
                      <div className="text-xs text-ink-muted">{l.user.nip}</div>
                    </>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${NADA_AKSI[l.aksi] ?? "bg-muted"}`}>{labelAksi(l.aksi)}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {l.entitas}
                  {l.entitasId && <div className="font-mono text-ink-muted">{l.entitasId.slice(0, 8)}…</div>}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{l.ipAddress ?? "—"}</td>
                <td className="max-w-[22rem] px-3 py-2 text-xs">
                  {l.metadata ? (
                    <details>
                      <summary className="cursor-pointer text-brand-700 dark:text-brand-300">Lihat</summary>
                      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2">{JSON.stringify(l.metadata, null, 2)}</pre>
                    </details>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
            {r.data.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState kecil judul="Tidak ada catatan audit yang cocok." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {jumlahHalaman > 1 && (
        <nav aria-label="Halaman audit log" className="flex items-center justify-between gap-2">
          {r.page > 1 ? <Link href={tautan(r.page - 1)} className="btn btn-secondary">← Sebelumnya</Link> : <span />}
          {r.page < jumlahHalaman ? <Link href={tautan(r.page + 1)} className="btn btn-secondary">Berikutnya →</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
