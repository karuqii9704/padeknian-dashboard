import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { USERS } from "./support/data";
import { anggotaTim, buatAlokasi, catat, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

const E: Record<string, string> = {};
let penugasanYul = "";
let alokasiId = "";
let periodeId = "";

const verif = (request: import("@playwright/test").APIRequestContext, id: string, data: object) =>
  request.post(`/api/pekerjaan-harian/${id}/verifikasi`, { data });
const progres = async () => prisma.penugasanAlokasi.findUniqueOrThrow({ where: { id: penugasanYul } });

test("setup: alokasi untuk Yul dan entri-entri uji", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  const tim = await timMilik(ketua.request);
  const u = await anggotaTim(ketua.request, tim.id, periodeId);
  const al = await buatAlokasi(ketua.request, { timId: tim.id, periodeId, judul: "Uji aksi verifikasi", userIds: [u(USERS.yul.nama), u(USERS.ketua.nama)], target: 100 });
  alokasiId = al.id;
  penugasanYul = al.penugasan.find((p) => p.userId === u(USERS.yul.nama))!.id;
  const penKetua = al.penugasan.find((p) => p.userId === u(USERS.ketua.nama))!.id;
  E.sendiri = await catat(ketua.request, penKetua, "AKSI entri ketua sendiri");
  await ketua.tutup();

  const yul = await sebagai(browser, USERS.yul.nip);
  for (const [k, vol] of [["setuju", 10], ["revisi", 4], ["tolak", 6], ["balap", 2], ["kunci", 1], ["ui1", 7], ["ui2", 5]] as const) {
    E[k] = await catat(yul.request, penugasanYul, `AKSI entri ${k}`, vol);
  }
  await yul.tutup();
  expect(Number((await progres()).menunggu)).toBe(35);
});

test("SETUJUI tanpa catatan: status DISETUJUI, riwayat dicatat, progres alokasi dihitung ulang", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const r = await verif(ketua.request, E.setuju, { aksi: "SETUJUI" });
  expect(r.status()).toBe(200);
  expect((await r.json()).statusVerifikasi).toBe("DISETUJUI");

  expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: E.setuju } })).statusVerifikasi).toBe("DISETUJUI");
  const rows = await prisma.verifikasi.findMany({ where: { pekerjaanHarianId: E.setuju } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ aksi: "SETUJUI", catatan: null });
  expect(rows[0].verifikatorId).toBe((await prisma.user.findUniqueOrThrow({ where: { nip: USERS.ketua.nip } })).id);

  const p = await progres();
  expect(Number(p.realisasi)).toBe(10);
  expect(Number(p.menunggu)).toBe(25);
  await ketua.tutup();
});

test("MINTA_REVISI dan TOLAK wajib catatan ≥ 10 karakter; hasilnya tidak masuk capaian", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  for (const aksi of ["MINTA_REVISI", "TOLAK"]) {
    const tanpa = await verif(ketua.request, E.revisi, { aksi });
    expect(tanpa.status(), aksi).toBe(400);
    expect((await tanpa.json()).pesan).toContain("minimal 10 karakter");
    const pendek = await verif(ketua.request, E.revisi, { aksi, catatan: "123456789" });
    expect(pendek.status(), aksi).toBe(400);
  }
  expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: E.revisi } })).statusVerifikasi).toBe("MENUNGGU");
  expect(await prisma.verifikasi.count({ where: { pekerjaanHarianId: E.revisi } })).toBe(0);

  expect((await verif(ketua.request, E.revisi, { aksi: "MINTA_REVISI", catatan: "Lampirkan foto lokasi kegiatan." })).status()).toBe(200);
  expect((await verif(ketua.request, E.tolak, { aksi: "TOLAK", catatan: "Bukan bagian dari alokasi ini." })).status()).toBe(200);
  expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: E.revisi } })).statusVerifikasi).toBe("MINTA_REVISI");
  expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: E.tolak } })).statusVerifikasi).toBe("DITOLAK");

  const p = await progres();
  expect(Number(p.realisasi), "hanya DISETUJUI yang dihitung").toBe(10);
  expect(Number(p.menunggu), "revisi/tolak keluar dari menunggu").toBe(15);
  await ketua.tutup();
});

test("wewenang: ketua tim lain, pegawai, pimpinan, admin, dan verifikasi mandiri ditolak 403", async ({ browser }) => {
  const kasus: [string, string][] = [
    [USERS.ketua2.nip, "ketua tim lain"],
    [USERS.yul.nip, "pegawai"],
    [USERS.pimpinan.nip, "pimpinan"],
    [USERS.admin.nip, "admin"],
  ];
  for (const [nip, nama] of kasus) {
    const u = await sebagai(browser, nip);
    expect((await verif(u.request, E.balap, { aksi: "SETUJUI" })).status(), nama).toBe(403);
    await u.tutup();
  }
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const sendiri = await verif(ketua.request, E.sendiri, { aksi: "SETUJUI" });
  expect(sendiri.status()).toBe(403);
  expect((await sendiri.json()).pesan).toContain("sendiri");
  expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: E.balap } })).statusVerifikasi).toBe("MENUNGGU");
  await ketua.tutup();
});

test("sudah diverifikasi → 409; dua verifikasi bersamaan hanya satu yang berhasil; periode DIKUNCI → 409", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  expect((await verif(ketua.request, E.setuju, { aksi: "SETUJUI" })).status()).toBe(409);

  const hasil = await Promise.all([verif(ketua.request, E.balap, { aksi: "SETUJUI" }), verif(ketua.request, E.balap, { aksi: "SETUJUI" })]);
  expect(hasil.map((r) => r.status()).sort()).toEqual([200, 409]);
  expect(await prisma.verifikasi.count({ where: { pekerjaanHarianId: E.balap } }), "tepat satu baris riwayat").toBe(1);

  await prisma.periode.update({ where: { id: periodeId }, data: { status: "DIKUNCI" } });
  try {
    const r = await verif(ketua.request, E.kunci, { aksi: "SETUJUI" });
    expect(r.status()).toBe(409);
    expect((await r.json()).pesan).toContain("dikunci");
  } finally {
    await prisma.periode.update({ where: { id: periodeId }, data: { status: "AKTIF" } });
  }
  expect((await verif(ketua.request, "00000000-0000-4000-8000-000000000000", { aksi: "SETUJUI" })).status()).toBe(404);
  await ketua.tutup();
});

test("alur revisi: pegawai membaca catatan, memperbaiki, diverifikasi ulang; riwayat bertambah (append-only)", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const list = await (await yul.request.get("/api/pekerjaan-harian?perluTindakan=true&pageSize=200")).json();
  const e = list.data.find((x: { id: string }) => x.id === E.revisi);
  expect(e.verifikasiTerakhir).toMatchObject({ aksi: "MINTA_REVISI", catatan: "Lampirkan foto lokasi kegiatan.", verifikator: USERS.ketua.nama });
  expect((await yul.request.patch(`/api/pekerjaan-harian/${E.revisi}`, { data: { deskripsiCapaian: "AKSI entri revisi (diperbaiki)" } })).status()).toBe(200);
  await yul.tutup();

  const ketua = await sebagai(browser, USERS.ketua.nip);
  expect((await verif(ketua.request, E.revisi, { aksi: "SETUJUI", catatan: "Sudah sesuai." })).status()).toBe(200);
  const riwayat = await prisma.verifikasi.findMany({ where: { pekerjaanHarianId: E.revisi }, orderBy: { createdAt: "asc" } });
  expect(riwayat.map((v) => v.aksi)).toEqual(["MINTA_REVISI", "SETUJUI"]);
  expect(Number((await progres()).realisasi)).toBe(10 + 4 + 2); // setuju + revisi (kini disetujui) + balap
  await ketua.tutup();
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("ketua menyetujui lewat UI; minta revisi menuntut catatan; pegawai melihat catatan di halaman Revisi", async ({ browser }) => {
    const ketua = await sebagai(browser, USERS.ketua.nip);
    const page = ketua.page;
    await page.goto("/verifikasi", { waitUntil: "networkidle" });

    const k1 = page.locator(`[data-entri="${E.ui1}"]`);
    await expect(k1).toBeVisible();
    expect((await k1.getByRole("button", { name: "Setujui" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await k1.getByRole("button", { name: "Setujui" }).click();
    await expect(page.getByText("Catatan Yul Pegawai disetujui.")).toBeVisible();
    await expect(k1).toHaveCount(0);

    const k2 = page.locator(`[data-entri="${E.ui2}"]`);
    await k2.getByRole("button", { name: "Minta revisi" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Catatan untuk pegawai").fill("pendek");
    await dlg.getByRole("button", { name: "Kirim permintaan revisi" }).click();
    await expect(dlg.getByText("Catatan minimal 10 karakter.")).toBeVisible();
    await dlg.getByLabel("Catatan untuk pegawai").fill("Volume belum sesuai dengan bukti.");
    await dlg.getByRole("button", { name: "Kirim permintaan revisi" }).click();
    await expect(page.getByText("Catatan Yul Pegawai diminta revisi.")).toBeVisible();
    await expect(k2).toHaveCount(0);

    expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: E.ui1 } })).statusVerifikasi).toBe("DISETUJUI");
    expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: E.ui2 } })).statusVerifikasi).toBe("MINTA_REVISI");
    await ketua.tutup();

    const yul = await sebagai(browser, USERS.yul.nip);
    await yul.page.goto("/revisi", { waitUntil: "networkidle" });
    const kartu = yul.page.getByRole("listitem").filter({ hasText: "AKSI entri ui2" });
    await expect(kartu.getByText(`Diminta revisi oleh ${USERS.ketua.nama}`)).toBeVisible();
    await expect(kartu.getByText("Volume belum sesuai dengan bukti.")).toBeVisible();
    await yul.tutup();
  });
});

test("alokasi tidak terpengaruh entri lain: ringkasan alokasi menjumlah semua penerima", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const a = await prisma.alokasi.findUniqueOrThrow({ where: { id: alokasiId } });
  const p = await progres();
  expect(Number(a.realisasi)).toBeGreaterThanOrEqual(Number(p.realisasi));
  await ketua.tutup();
});
