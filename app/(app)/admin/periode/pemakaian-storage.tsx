import type { PemakaianStorage } from "@/lib/pemakaian-storage";
import { ukuran } from "@/lib/format-ukuran";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function PemakaianStorageView({ data }: { data: PemakaianStorage }) {
  const persen = data.kuotaBytes ? Math.min(100, (data.totalBytes / data.kuotaBytes) * 100) : null;
  const nada = persen === null ? "bg-brand-500" : persen >= 90 ? "bg-red-500" : persen >= 75 ? "bg-gold-500" : "bg-brand-500";
  return (
    <section aria-labelledby="h-storage" className="panel space-y-4 p-4 sm:p-5">
      <div>
        <h2 id="h-storage" className="text-[15px] font-semibold">Pemakaian penyimpanan</h2>
        <p className="text-xs text-ink-muted">Bukti dukung dan lampiran event per periode (ukuran saat diunggah). Berkas rekap tidak ikut dihitung.</p>
      </div>
      <div className="space-y-1.5" data-storage-total={data.totalBytes}>
        <p className="text-sm">
          <span className="text-lg font-semibold tabular-nums">{ukuran(data.totalBytes)}</span>
          {data.kuotaBytes && <span className="text-ink-muted"> dari {ukuran(data.kuotaBytes)}</span>} · {data.jumlahBerkas.toLocaleString("id-ID")} berkas
        </p>
        {persen !== null && (
          <div role="meter" aria-label="Pemakaian kuota penyimpanan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(persen)} className="h-2 overflow-hidden rounded-full bg-track">
            <div className={`h-full rounded-full ${nada}`} style={{ width: `${Math.max(1, persen)}%` }} />
          </div>
        )}
        {persen !== null && persen >= 75 && (
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Kuota hampir penuh: arsipkan bukti periode lama (ZIP) atau tambah kuota penyimpanan.</p>
        )}
        {persen === null && <p className="text-xs text-ink-muted">Atur env STORAGE_KUOTA_GB untuk menampilkan sisa kuota.</p>}
      </div>
      {data.perPeriode.length > 0 && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b text-xs">
              <tr>
                <th scope="col" className="px-3 py-2.5">Periode</th>
                <th scope="col" className="px-3 py-2.5 text-right">Bukti dukung</th>
                <th scope="col" className="px-3 py-2.5 text-right">Lampiran event</th>
                <th scope="col" className="px-3 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.perPeriode.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="px-3 py-2 font-normal">
                    {BULAN[p.bulan - 1]} {p.tahun}
                    <span className="ml-1.5 text-xs text-ink-muted">{p.status === "DIKUNCI" ? "dikunci" : p.status === "AKTIF" ? "aktif" : "draf"}</span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {ukuran(p.bukti.bytes)}
                    <span className="block text-xs text-ink-muted">{p.bukti.jumlah} berkas</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {ukuran(p.lampiran.bytes)}
                    <span className="block text-xs text-ink-muted">{p.lampiran.jumlah} berkas</span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{ukuran(p.totalBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
