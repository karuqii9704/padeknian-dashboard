import { teksDurasi, type KecepatanVerifikasi } from "@/lib/kecepatan-verifikasi-hitung";

/** Antrean > 3 hari dianggap perlu perhatian (sesuai batas catatan susulan 3 hari). */
const BATAS_JAM = 72;

function Angka({ label, nilai, ket, waspada }: { label: string; nilai: string; ket?: string; waspada?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${waspada ? "bg-amber-50 ring-1 ring-amber-200 dark:bg-[#1a1200] dark:ring-amber-900" : "bg-muted/60"}`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{nilai}</p>
      {ket && <p className="text-xs text-ink-muted">{ket}</p>}
    </div>
  );
}

/** Seberapa cepat ketua tim memverifikasi: antrean saat ini dan waktu sampai diverifikasi, per tim. */
export function KecepatanVerifikasiPanel({ data, tampilkanKetua }: { data: KecepatanVerifikasi; tampilkanKetua: boolean }) {
  const r = data.ringkas;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Angka label="Antre verifikasi" nilai={String(r.menunggu)} ket="catatan menunggu" />
        <Angka label="Median lama menunggu" nilai={teksDurasi(r.medianTungguJam)} ket="catatan yang masih antre" waspada={(r.medianTungguJam ?? 0) > BATAS_JAM} />
        <Angka label="Paling lama menunggu" nilai={teksDurasi(r.tertuaJam)} waspada={(r.tertuaJam ?? 0) > BATAS_JAM} />
        <Angka label="Median sampai diverifikasi" nilai={teksDurasi(r.medianSelesaiJam)} ket={`dari ${r.jumlahSelesai} catatan terverifikasi`} />
      </div>

      {data.perTim.length > 0 && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b text-xs">
              <tr>
                <th scope="col" className="px-3 py-2.5">Tim</th>
                <th scope="col" className="px-3 py-2.5 text-right">Antre</th>
                <th scope="col" className="px-3 py-2.5 text-right">Median menunggu</th>
                <th scope="col" className="px-3 py-2.5 text-right">Paling lama</th>
                <th scope="col" className="px-3 py-2.5 text-right">Median sampai diverifikasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.perTim.map((t) => {
                const lama = (t.tertuaJam ?? 0) > BATAS_JAM;
                return (
                  <tr key={t.timId} data-kecepatan-tim={t.timId}>
                    <th scope="row" className="px-3 py-2 font-normal">
                      <span className="font-medium">{t.nama}</span>
                      {tampilkanKetua && <span className="block text-xs text-ink-muted">Ketua: {t.ketua}</span>}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.menunggu > 0 ? <span className="rounded-full bg-gold-50 px-2 py-0.5 font-medium text-gold-700">{t.menunggu}</span> : 0}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{teksDurasi(t.medianTungguJam)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${lama ? "font-semibold text-red-700 dark:text-red-300" : ""}`}>
                      {teksDurasi(t.tertuaJam)}
                      {lama && <span className="sr-only"> (lebih dari 3 hari)</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {teksDurasi(t.medianSelesaiJam)}
                      {t.jumlahSelesai > 0 && <span className="block text-xs text-ink-muted">{t.jumlahSelesai} catatan</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-muted">
        Lama menunggu dihitung sejak catatan terakhir diajukan. &quot;Sampai diverifikasi&quot; = dari catatan dibuat sampai verifikasi pertama. Merah: menunggu lebih dari 3 hari.
      </p>
    </div>
  );
}
