import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { recalculateProgresAlokasi } from "../lib/progres-alokasi";
import { USERS } from "./support/data";
import { loginUI } from "./support/auth";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

async function api(request: APIRequestContext, method: "post" | "patch" | "delete" | "get", url: string, data?: unknown) {
  const res = await request[method](url, data === undefined ? undefined : { data });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}
async function sebagai(browser: Browser, nip: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginUI(page, nip);
  return { request: page.request, tutup: () => ctx.close() };
}

test.describe.configure({ mode: "serial" });

test.describe("Rekalkulasi agregat progres alokasi (FR-22)", () => {
  let alokasiId = "";
  let penugasanId = "";
  let yulId = "";
  let timId = "";
  let periodeId = "";

  /** Bandingkan agregat tersimpan dengan SUM langsung ke tabel entri. */
  async function cocokDenganSumLangsung() {
    const sum = async (status: "DISETUJUI" | "MENUNGGU") =>
      Number((await prisma.pekerjaanHarian.aggregate({ _sum: { volume: true }, where: { penugasanId, statusVerifikasi: status } }))._sum.volume ?? 0);
    const p = await prisma.penugasanAlokasi.findUniqueOrThrow({ where: { id: penugasanId } });
    const a = await prisma.alokasi.findUniqueOrThrow({ where: { id: alokasiId } });
    const real = await sum("DISETUJUI");
    const tunggu = await sum("MENUNGGU");
    expect(Number(p.realisasi)).toBe(real);
    expect(Number(p.menunggu)).toBe(tunggu);
    expect(Number(a.realisasi)).toBe(real); // satu penerima saja pada alokasi uji ini
    expect(Number(a.menunggu)).toBe(tunggu);
    return { real, tunggu, persen: Number(p.persen), persenAlokasi: Number(a.persen) };
  }

  test("setup: alokasi dengan satu penerima (target 60)", async ({ browser }) => {
    const ketua = await sebagai(browser, USERS.ketua.nip);
    const periode = ((await (await ketua.request.get("/api/periode")).json()).data as { id: string; status: string }[]).find((p) => p.status === "AKTIF")!;
    periodeId = periode.id;
    const tim = (await (await ketua.request.get("/api/tim")).json()).data[0] as { id: string };
    timId = tim.id;
    const anggota = (await (await ketua.request.get(`/api/tim/${tim.id}/anggota?periodeId=${periode.id}`)).json()).anggota as { userId: string; nama: string }[];
    yulId = anggota.find((a) => a.nama === USERS.yul.nama)!.userId;
    const r = await api(ketua.request, "post", "/api/alokasi", {
      timId,
      periodeId,
      judul: "Uji rekalkulasi",
      deskripsi: "uji",
      tanggalMulai: "2026-10-01",
      tanggalSelesai: "2026-10-30",
      targetVolume: 60,
      satuan: "dokumen",
      prioritas: "SEDANG",
      penugasan: [{ userId: yulId, targetVolume: 60 }],
    });
    expect(r.status).toBe(201);
    alokasiId = r.body.alokasi.id;
    penugasanId = r.body.alokasi.penugasan[0].id;
    await ketua.tutup();
  });

  test("membuat, mengubah, dan menghapus entri memperbarui agregat; cocok dengan SUM langsung", async ({ browser }) => {
    const yul = await sebagai(browser, USERS.yul.nip);
    const baru = (volume: number) =>
      api(yul.request, "post", "/api/pekerjaan-harian", { penugasanId, tanggal: "2026-10-14", deskripsiCapaian: "uji", volume });

    expect(await cocokDenganSumLangsung()).toMatchObject({ real: 0, tunggu: 0, persen: 0 });

    const e1 = await baru(20);
    expect(e1.status).toBe(201);
    expect(await cocokDenganSumLangsung()).toMatchObject({ real: 0, tunggu: 20 });

    const e2 = await baru(10);
    expect(await cocokDenganSumLangsung()).toMatchObject({ tunggu: 30 });

    // Ubah volume entri yang masih MENUNGGU.
    expect((await api(yul.request, "patch", `/api/pekerjaan-harian/${e2.body.entri.id}`, { volume: 15 })).status).toBe(200);
    expect(await cocokDenganSumLangsung()).toMatchObject({ tunggu: 35 });

    // Hapus entri.
    expect((await api(yul.request, "delete", `/api/pekerjaan-harian/${e2.body.entri.id}`)).status).toBe(200);
    expect(await cocokDenganSumLangsung()).toMatchObject({ tunggu: 20 });

    // Verifikasi (disimulasikan; endpoint verifikasi baru ada di t22) lalu hitung ulang.
    await prisma.pekerjaanHarian.update({ where: { id: e1.body.entri.id }, data: { statusVerifikasi: "DISETUJUI" } });
    await recalculateProgresAlokasi(alokasiId);
    expect(await cocokDenganSumLangsung()).toMatchObject({ real: 20, tunggu: 0, persen: 33.3, persenAlokasi: 33.3 });

    // Idempoten: dua kali hitung ulang menghasilkan angka yang sama.
    const sebelum = await cocokDenganSumLangsung();
    await recalculateProgresAlokasi(alokasiId);
    await recalculateProgresAlokasi(alokasiId);
    expect(await cocokDenganSumLangsung()).toEqual(sebelum);

    // Daftar alokasi memakai agregat tersimpan.
    const list = await api(yul.request, "get", `/api/alokasi?periodeId=${periodeId}`);
    const a = list.body.data.find((x: { id: string }) => x.id === alokasiId);
    expect(a.penugasan[0]).toMatchObject({ realisasi: 20, menunggu: 0, persen: 33.3 });
    await yul.tutup();
  });

  test("mengubah target alokasi menghitung ulang persentase", async ({ browser }) => {
    const ketua = await sebagai(browser, USERS.ketua.nip);
    const r = await api(ketua.request, "patch", `/api/alokasi/${alokasiId}`, { penugasan: [{ userId: yulId, targetVolume: 40 }] });
    expect(r.status).toBe(200);
    expect(r.body.alokasi.penugasan[0]).toMatchObject({ realisasi: 20, persen: 50 });
    expect(r.body.alokasi.ringkasan.persen).toBe(50);
    expect((await cocokDenganSumLangsung()).persen).toBe(50);
    await ketua.tutup();
  });
});
