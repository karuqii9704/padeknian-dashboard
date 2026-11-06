import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { LIBUR_UJI, USERS } from "./support/data";
import { loginUI } from "./support/auth";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());

let penugasanYul = "";
let penugasanRina = "";
let periodeAktifId = "";

async function api(request: APIRequestContext, method: "post" | "patch" | "delete" | "get", url: string, data?: unknown) {
  const res = await request[method](url, data === undefined ? undefined : { data });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

/** Konteks browser terpisah yang sudah login sebagai pengguna tertentu. */
async function sebagai(browser: Browser, nip: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginUI(page, nip);
  return { page, request: page.request, tutup: () => ctx.close() };
}

const entri = (penugasanId: string, tanggal: string, extra: object = {}) => ({
  penugasanId,
  tanggal,
  deskripsiCapaian: "Entri dokumen",
  volume: 10,
  ...extra,
});

test.describe.configure({ mode: "serial" });

test.describe("Entri pekerjaan harian — API", () => {
  test("setup: ketua membuat alokasi untuk Yul dan Rina", async ({ browser }) => {
    const ketua = await sebagai(browser, USERS.ketua.nip);
    const periode = ((await (await ketua.request.get("/api/periode")).json()).data as { id: string; status: string }[]).find(
      (p) => p.status === "AKTIF",
    )!;
    periodeAktifId = periode.id;
    const tim = (await (await ketua.request.get("/api/tim")).json()).data[0] as { id: string };
    const anggota = (await (await ketua.request.get(`/api/tim/${tim.id}/anggota?periodeId=${periode.id}`)).json()).anggota as {
      userId: string;
      nama: string;
    }[];
    const id = (n: string) => anggota.find((a) => a.nama === n)!.userId;
    const r = await api(ketua.request, "post", "/api/alokasi", {
      timId: tim.id,
      periodeId: periode.id,
      judul: "Entri uji harian",
      deskripsi: "uji",
      tanggalMulai: "2026-10-01",
      tanggalSelesai: "2026-10-30",
      targetVolume: 100,
      satuan: "dokumen",
      prioritas: "SEDANG",
      penugasan: [{ userId: id(USERS.yul.nama) }, { userId: id(USERS.rina.nama) }],
    });
    expect(r.status).toBe(201);
    const pen = r.body.alokasi.penugasan as { id: string; userId: string }[];
    penugasanYul = pen.find((p) => p.userId === id(USERS.yul.nama))!.id;
    penugasanRina = pen.find((p) => p.userId === id(USERS.rina.nama))!.id;
    await ketua.tutup();
  });

  test("hari ini valid; mundur 1-2 hari ditandai backfill; entri ad-hoc tersimpan", async ({ browser }) => {
    const yul = await sebagai(browser, USERS.yul.nip);
    const hariIni = await api(yul.request, "post", "/api/pekerjaan-harian", entri(penugasanYul, "2026-10-14"));
    expect(hariIni.status).toBe(201);
    expect(hariIni.body.entri.isBackfill).toBe(false);
    expect(hariIni.body.entri.statusVerifikasi).toBe("MENUNGGU");
    expect(hariIni.body.entri.satuan).toBe("dokumen");

    const kemarin = await api(yul.request, "post", "/api/pekerjaan-harian", entri(penugasanYul, "2026-10-13"));
    expect(kemarin.status).toBe(201);
    expect(kemarin.body.entri.isBackfill).toBe(true);
    expect((await api(yul.request, "post", "/api/pekerjaan-harian", entri(penugasanYul, "2026-10-12"))).status).toBe(201);

    const adhoc = await api(yul.request, "post", "/api/pekerjaan-harian", {
      isAdHoc: true,
      judulAdHoc: "Bantu rapat koordinasi",
      tanggal: "2026-10-14",
      deskripsiCapaian: "Notulen",
      volume: 1,
      satuan: "kegiatan",
    });
    expect(adhoc.status).toBe(201);
    expect(adhoc.body.entri.isAdHoc).toBe(true);
    expect(adhoc.body.entri.alokasi).toBeNull();
    await yul.tutup();
  });

  test("Sabtu, Minggu, hari libur, backfill > 3 hari, masa depan, dan luar periode ditolak (pesan Indonesia)", async ({ browser }) => {
    const yul = await sebagai(browser, USERS.yul.nip);
    const tolak = async (tanggal: string, potongan: string, status = 400) => {
      const r = await api(yul.request, "post", "/api/pekerjaan-harian", entri(penugasanYul, tanggal));
      expect(r.status, tanggal).toBe(status);
      expect(r.body.pesan, tanggal).toContain(potongan);
    };
    await tolak("2026-10-10", "Sabtu, 2026-10-10 adalah akhir pekan");
    await tolak("2026-10-11", "Minggu, 2026-10-11 adalah akhir pekan");
    await tolak(LIBUR_UJI.tanggal, `hari libur (${LIBUR_UJI.keterangan})`);
    await tolak("2026-10-09", "maksimal 3 hari kalender"); // Jumat, 5 hari lalu
    await tolak("2026-10-15", "masa depan");
    await tolak("2026-11-03", "masa depan");
    await tolak("2026-09-30", "luar rentang periode"); // alokasi periode Oktober
    await yul.tutup();
  });

  test("periode DIKUNCI -> 409 untuk entri baru (tugas tambahan)", async ({ browser }) => {
    const yul = await sebagai(browser, USERS.yul.nip);
    // Periode 2 bulan lalu berstatus DIKUNCI; 12 Agu 2026 adalah Rabu.
    const r = await api(yul.request, "post", "/api/pekerjaan-harian", {
      isAdHoc: true,
      judulAdHoc: "Tugas lama",
      tanggal: "2026-08-12",
      deskripsiCapaian: "x",
      satuan: "kegiatan",
    });
    expect(r.status).toBe(409);
    expect(r.body.pesan).toContain("dikunci");
    await yul.tutup();
  });

  test("kepemilikan: Rina tidak bisa memakai/mengubah/menghapus milik Yul; ketua & pimpinan bisa melihat", async ({ browser }) => {
    const yul = await sebagai(browser, USERS.yul.nip);
    const dibuat = await api(yul.request, "post", "/api/pekerjaan-harian", entri(penugasanYul, "2026-10-14", { deskripsiCapaian: "Milik Yul" }));
    const id = dibuat.body.entri.id as string;
    await yul.tutup();

    const rina = await sebagai(browser, USERS.rina.nip);
    expect((await api(rina.request, "post", "/api/pekerjaan-harian", entri(penugasanYul, "2026-10-14"))).status).toBe(403);
    expect((await api(rina.request, "patch", `/api/pekerjaan-harian/${id}`, { volume: 99 })).status).toBe(403);
    expect((await api(rina.request, "delete", `/api/pekerjaan-harian/${id}`)).status).toBe(403);
    expect((await api(rina.request, "get", `/api/pekerjaan-harian/${id}`)).status).toBe(404);
    expect((await api(rina.request, "post", "/api/pekerjaan-harian", entri(penugasanRina, "2026-10-14"))).status).toBe(201);
    await rina.tutup();

    const ketua = await sebagai(browser, USERS.ketua.nip);
    const det = await api(ketua.request, "get", `/api/pekerjaan-harian/${id}`);
    expect(det.status).toBe(200);
    expect(det.body.entri.bukti).toEqual([]);
    expect(det.body.entri.verifikasi).toEqual([]);
    expect((await api(ketua.request, "patch", `/api/pekerjaan-harian/${id}`, { volume: 1 })).status).toBe(403);
    await ketua.tutup();

    const dewi = await sebagai(browser, USERS.dewi.nip);
    expect((await api(dewi.request, "get", `/api/pekerjaan-harian/${id}`)).status).toBe(404);
    expect((await api(dewi.request, "get", "/api/pekerjaan-harian")).body.total).toBe(0);
    await dewi.tutup();

    const pim = await sebagai(browser, USERS.pimpinan.nip);
    const list = await api(pim.request, "get", `/api/pekerjaan-harian?periodeId=${periodeAktifId}`);
    expect(list.body.total).toBeGreaterThanOrEqual(5);
    await pim.tutup();
  });

  test("PATCH/DELETE: DISETUJUI dan periode DIKUNCI ditolak; revisi kembali MENUNGGU; ubah tanggal divalidasi ulang", async ({ browser }) => {
    const yul = await sebagai(browser, USERS.yul.nip);
    const dibuat = await api(yul.request, "post", "/api/pekerjaan-harian", entri(penugasanYul, "2026-10-14", { deskripsiCapaian: "Untuk diubah" }));
    const id = dibuat.body.entri.id as string;

    expect((await api(yul.request, "patch", `/api/pekerjaan-harian/${id}`, { tanggal: "2026-10-10" })).status).toBe(400);
    const ubahOk = await api(yul.request, "patch", `/api/pekerjaan-harian/${id}`, { tanggal: "2026-10-13" });
    expect(ubahOk.status).toBe(200);
    expect(ubahOk.body.entri.isBackfill).toBe(true);

    await prisma.pekerjaanHarian.update({ where: { id }, data: { statusVerifikasi: "MINTA_REVISI" } });
    const revisi = await api(yul.request, "patch", `/api/pekerjaan-harian/${id}`, { deskripsiCapaian: "Sudah diperbaiki" });
    expect(revisi.status).toBe(200);
    expect(revisi.body.entri.statusVerifikasi).toBe("MENUNGGU");

    await prisma.pekerjaanHarian.update({ where: { id }, data: { statusVerifikasi: "DISETUJUI" } });
    expect((await api(yul.request, "patch", `/api/pekerjaan-harian/${id}`, { volume: 1 })).status).toBe(409);
    expect((await api(yul.request, "delete", `/api/pekerjaan-harian/${id}`)).status).toBe(409);

    await prisma.pekerjaanHarian.update({ where: { id }, data: { statusVerifikasi: "MENUNGGU" } });
    await prisma.periode.update({ where: { id: periodeAktifId }, data: { status: "DIKUNCI" } });
    try {
      expect((await api(yul.request, "patch", `/api/pekerjaan-harian/${id}`, { volume: 1 })).status).toBe(409);
      expect((await api(yul.request, "delete", `/api/pekerjaan-harian/${id}`)).status).toBe(409);
    } finally {
      await prisma.periode.update({ where: { id: periodeAktifId }, data: { status: "AKTIF" } });
    }
    expect((await api(yul.request, "delete", `/api/pekerjaan-harian/${id}`)).status).toBe(200);
    await yul.tutup();
  });
});
