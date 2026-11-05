import { expect, test, type APIRequestContext } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { recalculateProgresAlokasi } from "../lib/progres-alokasi";
import { USERS } from "./support/data";
import { loginUI } from "./support/auth";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());

async function konteks(request: APIRequestContext) {
  const periode = ((await (await request.get("/api/periode")).json()).data as { id: string; status: string; tanggalMulai: string }[]).find(
    (p) => p.status === "AKTIF",
  )!;
  const tim = (await (await request.get("/api/tim")).json()).data[0] as { id: string };
  const anggota = (await (await request.get(`/api/tim/${tim.id}/anggota?periodeId=${periode.id}`)).json()).anggota as {
    userId: string;
    nama: string;
  }[];
  const id = (nama: string) => anggota.find((a) => a.nama === nama)!.userId;
  return { periode, tim, yul: id(USERS.yul.nama), rina: id(USERS.rina.nama) };
}

function bodyAlokasi(k: Awaited<ReturnType<typeof konteks>>, judul: string) {
  const mulai = k.periode.tanggalMulai.slice(0, 8) + "05";
  const selesai = k.periode.tanggalMulai.slice(0, 8) + "20";
  return {
    timId: k.tim.id,
    periodeId: k.periode.id,
    judul,
    deskripsi: "uji progres",
    tanggalMulai: mulai,
    tanggalSelesai: selesai,
    targetVolume: 100,
    satuan: "dokumen",
    prioritas: "SEDANG",
    penugasan: [
      { userId: k.yul, targetVolume: 60 },
      { userId: k.rina, targetVolume: 40 },
    ],
  };
}

test.describe("Progres realisasi & pembatalan alokasi", () => {
  test("realisasi = SUM(volume DISETUJUI) / target; MENUNGGU terpisah; revisi/tolak tidak dihitung", async ({ page }) => {
    await loginUI(page, USERS.ketua.nip);
    const k = await konteks(page.request);
    const res = await page.request.post("/api/alokasi", { data: bodyAlokasi(k, "Progres uji") });
    expect(res.status()).toBe(201);
    const alokasi = (await res.json()).alokasi;
    const pYul = alokasi.penugasan.find((p: { userId: string }) => p.userId === k.yul).id;

    const entri = (volume: number, statusVerifikasi: "DISETUJUI" | "MENUNGGU" | "MINTA_REVISI" | "DITOLAK", hari: number) =>
      prisma.pekerjaanHarian.create({
        data: {
          periodeId: k.periode.id,
          penugasanId: pYul,
          userId: k.yul,
          tanggal: new Date(`${k.periode.tanggalMulai.slice(0, 8)}${String(hari).padStart(2, "0")}T00:00:00Z`),
          deskripsiCapaian: "uji",
          volume,
          satuan: "dokumen",
          statusVerifikasi,
        },
      });
    await entri(20, "DISETUJUI", 6);
    await entri(10, "DISETUJUI", 7);
    await entri(10, "MENUNGGU", 8);
    await entri(5, "MINTA_REVISI", 9);
    await entri(7, "DITOLAK", 10);
    // Entri disisipkan langsung ke DB (melewati API), jadi agregat dihitung ulang seperti yang dilakukan endpoint verifikasi.
    await recalculateProgresAlokasi(alokasi.id);

    const list = await (await page.request.get(`/api/alokasi?periodeId=${k.periode.id}`)).json();
    const a = list.data.find((x: { judul: string }) => x.judul === "Progres uji");
    const yul = a.penugasan.find((p: { userId: string }) => p.userId === k.yul);
    const rina = a.penugasan.find((p: { userId: string }) => p.userId === k.rina);
    expect(yul.realisasi).toBe(30);
    expect(yul.menunggu).toBe(10);
    expect(yul.persen).toBe(50);
    expect(rina.realisasi).toBe(0);
    expect(a.ringkasan).toMatchObject({ target: 100, realisasi: 30, menunggu: 10, persen: 30 });

    await page.goto("/alokasi", { waitUntil: "networkidle" });
    const kartu = page.getByRole("listitem").filter({ hasText: "Progres uji" }).first();
    await expect(kartu.getByText("30 / 60 dokumen")).toBeVisible();
    await expect(kartu.getByLabel(`Progres ${USERS.yul.nama}`).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    await expect(kartu.getByLabel("Progres total alokasi").getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30");
  });

  test("hapus alokasi ber-entri ditolak; pembatalan wajib alasan lalu mengubah status", async ({ page }) => {
    await loginUI(page, USERS.ketua.nip);
    const k = await konteks(page.request);
    const list = await (await page.request.get(`/api/alokasi?periodeId=${k.periode.id}`)).json();
    const a = list.data.find((x: { judul: string }) => x.judul === "Progres uji");

    const del = await page.request.delete(`/api/alokasi/${a.id}`);
    expect(del.status()).toBe(409);
    expect((await del.json()).pesan).toContain("sudah memiliki entri harian");

    // Tidak boleh melepas penerima yang sudah punya entri.
    const lepas = await page.request.patch(`/api/alokasi/${a.id}`, { data: { penugasan: [{ userId: k.rina }] } });
    expect(lepas.status()).toBe(409);

    const tanpaAlasan = await page.request.post(`/api/alokasi/${a.id}/batalkan`, { data: { alasan: "   " } });
    expect(tanpaAlasan.status()).toBe(400);
    expect((await tanpaAlasan.json()).pesan).toBe("Alasan pembatalan wajib diisi.");

    // Lewat UI.
    await page.goto("/alokasi", { waitUntil: "networkidle" });
    const kartu = page.getByRole("listitem").filter({ hasText: "Progres uji" }).first();
    await kartu.getByRole("button", { name: "Batalkan" }).click();
    await page.getByRole("button", { name: "Batalkan alokasi" }).click();
    await expect(page.getByText("Alasan pembatalan wajib diisi.")).toBeVisible();
    await page.getByLabel("Alasan pembatalan").fill("Kegiatan dipindah ke bulan depan");
    await page.getByRole("button", { name: "Batalkan alokasi" }).click();
    await expect(page.getByText("Alasan pembatalan: Kegiatan dipindah ke bulan depan")).toBeVisible();

    const lagi = await page.request.post(`/api/alokasi/${a.id}/batalkan`, { data: { alasan: "lagi" } });
    expect(lagi.status()).toBe(409);
  });

  test("alokasi tanpa entri bisa dihapus", async ({ page }) => {
    await loginUI(page, USERS.ketua.nip);
    const k = await konteks(page.request);
    const res = await page.request.post("/api/alokasi", { data: bodyAlokasi(k, "Akan dihapus") });
    const id = (await res.json()).alokasi.id;
    const del = await page.request.delete(`/api/alokasi/${id}`);
    expect(del.status()).toBe(200);
    const list = await (await page.request.get(`/api/alokasi?periodeId=${k.periode.id}`)).json();
    expect(list.data.map((x: { id: string }) => x.id)).not.toContain(id);
  });
});
