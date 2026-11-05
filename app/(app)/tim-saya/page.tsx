import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { HttpError, requireRole } from "@/lib/rbac";
import { calonAnggota, daftarAnggotaDenganKetua } from "@/lib/tim";
import { EmptyState, Halaman, PageHeader } from "../../ui/primitives";
import { DaftarAnggota } from "../admin/tim/daftar-anggota";
import { PanelAnggota } from "../admin/tim/panel-anggota";
import { PilihPeriode } from "../dashboard/pegawai/[id]/pilih-periode";

export const dynamic = "force-dynamic";

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/**
 * Tim Saya: tim yang diikuti pengguna pada satu periode, sebagai ketua maupun anggota.
 * Untuk tim yang dipimpinnya, ketua dapat menambah/mengeluarkan anggota (FR-8; otorisasi tulis di API).
 */
export default async function TimSayaPage({ searchParams }: { searchParams: Promise<{ periodeId?: string }> }) {
  let user;
  try {
    user = await requireRole("PEGAWAI", "KETUA_TIM");
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    if (e instanceof HttpError && e.status === 403 && e.message.includes("mengganti password")) redirect("/ganti-password");
    return (
      <Halaman lebar="max-w-xl">
        <PageHeader judul="Akses ditolak" keterangan="Halaman ini untuk Pegawai dan Ketua Tim." />
      </Halaman>
    );
  }

  const { periodeId: diminta } = await searchParams;
  const periodes = await db.periode.findMany({
    select: { id: true, tahun: true, bulan: true, status: true },
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
  });
  const periode = periodes.find((p) => p.id === diminta) ?? periodes.find((p) => p.status === "AKTIF") ?? periodes[0];

  if (!periode) {
    return (
      <Halaman lebar="max-w-4xl">
        <PageHeader eyebrow="Tim" judul="Tim Saya" />
        <EmptyState judul="Belum ada periode." keterangan="Admin perlu membuat periode terlebih dahulu." />
      </Halaman>
    );
  }

  // Tim yang dipimpin (selalu terlihat di semua periode) + tim tempat menjadi anggota pada periode ini.
  const [dipimpin, keanggotaan] = await Promise.all([
    db.timKerja.findMany({
      where: { ketuaId: user.id, isActive: true },
      select: { id: true, nama: true, tahun: true, ketua: { select: { id: true, nama: true } } },
    }),
    db.anggotaTim.findMany({
      where: { userId: user.id, periodeId: periode.id, tim: { isActive: true } },
      select: { tim: { select: { id: true, nama: true, tahun: true, ketua: { select: { id: true, nama: true } } } } },
    }),
  ]);
  const petaTim = new Map([...keanggotaan.map((k) => k.tim), ...dipimpin].map((t) => [t.id, t]));
  const tims = [...petaTim.values()].sort((a, b) => {
    const ka = a.ketua.id === user.id ? 0 : 1;
    const kb = b.ketua.id === user.id ? 0 : 1;
    return ka - kb || a.nama.localeCompare(b.nama, "id");
  });

  const adaYangDipimpin = tims.some((t) => t.ketua.id === user.id);
  const [calon, daftar] = await Promise.all([
    adaYangDipimpin ? calonAnggota() : Promise.resolve([]),
    Promise.all(tims.filter((t) => t.ketua.id !== user.id).map(async (t) => [t.id, await daftarAnggotaDenganKetua(t.id, periode.id)] as const)),
  ]);
  const anggotaTim = new Map(daftar.map(([id, r]) => [id, r.ok ? r.anggota : []]));

  return (
    <Halaman lebar="max-w-4xl">
      <PageHeader
        eyebrow="Tim"
        judul="Tim Saya"
        keterangan={
          <>
            Tim kerja yang Anda ikuti pada {BULAN[periode.bulan - 1]} {periode.tahun}. Ketua tim ditandai{" "}
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-[#2a1f00] dark:text-amber-200">Ketua tim</span>.
            {adaYangDipimpin && " Untuk tim yang Anda pimpin, Anda dapat menambah atau mengeluarkan anggota."}
          </>
        }
        aksi={<PilihPeriode nilai={periode.id} opsi={periodes} />}
      />

      {tims.length === 0 && (
        <EmptyState
          judul="Anda belum tergabung dalam tim pada periode ini."
          keterangan="Keanggotaan tim diatur per periode oleh Admin atau ketua tim. Hubungi mereka bila Anda seharusnya sudah masuk tim."
        />
      )}

      {tims.map((t) => {
        const saya = t.ketua.id === user.id;
        const judul = (
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
              {t.nama}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  saya ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-[#2a1f00] dark:text-amber-200 dark:ring-amber-700" : "bg-muted text-ink-soft"
                }`}
              >
                {saya ? "Anda ketua tim ini" : "Anda anggota"}
              </span>
            </h2>
            <p className="text-xs text-ink-muted">
              Tahun {t.tahun} · Ketua: {t.ketua.nama}
            </p>
          </div>
        );
        if (saya) {
          return (
            <PanelAnggota
              key={`${t.id}-${periode.id}`}
              tim={t}
              periodes={periodes}
              calon={calon}
              periodeIdTetap={periode.id}
              penggunaId={user.id}
              judul={judul}
            />
          );
        }
        return (
          <section key={t.id} aria-label={`Anggota ${t.nama}`} className="rounded border p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">{judul}</div>
            <DaftarAnggota anggota={anggotaTim.get(t.id) ?? []} penggunaId={user.id} />
          </section>
        );
      })}
    </Halaman>
  );
}
