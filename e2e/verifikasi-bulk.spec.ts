import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { USERS } from "./support/data";
import { anggotaTim, buatAlokasi, catat, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

const bulk = (request: import("@playwright/test").APIRequestContext, ids: string[]) => request.post("/api/verifikasi/bulk", { data: { ids } });
const status = async (id: string) => (await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id } })).statusVerifikasi;

let periodeId = "";
let penYul = "";
let penRina = "";
const dua20: string[] = []; // 20 entri untuk bulk besar
const E: Record<string, string> = {};

test("setup: 20 entri menunggu (Yul & Rina), 1 entri tim lain, 1 entri sudah disetujui", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  const timA = await timMilik(ketua.request);
  const timB = await timMilik(ketua2.request);
  const uA = await anggotaTim(ketua.request, timA.id, periodeId);
  const uB = await anggotaTim(ketua2.request, timB.id, periodeId);
  const alA = await buatAlokasi(ketua.request, { timId: timA.id, periodeId, judul: "Uji bulk", userIds: [uA(USERS.yul.nama), uA(USERS.rina.nama)], target: 1000 });
  penYul = alA.penugasan.find((p) => p.userId === uA(USERS.yul.nama))!.id;
  penRina = alA.penugasan.find((p) => p.userId === uA(USERS.rina.nama))!.id;
  const alB = await buatAlokasi(ketua2.request, { timId: timB.id, periodeId, judul: "Uji bulk tim B", userIds: [uB(USERS.sari.nama)] });

  const yul = await sebagai(browser, USERS.yul.nip);
  const rina = await sebagai(browser, USERS.rina.nip);
  const sari = await sebagai(browser, USERS.sari.nip);
  for (let i = 0; i < 10; i++) {
    dua20.push(await catat(yul.request, penYul, `BULK Yul ${i}`, 2, i % 2 ? "2026-10-13" : "2026-10-14"));
    dua20.push(await catat(rina.request, penRina, `BULK Rina ${i}`, 3, i % 2 ? "2026-10-12" : "2026-10-14"));
  }
  E.sari = await catat(sari.request, alB.penugasan[0].id, "BULK Sari tim lain");
  E.sudah = await catat(yul.request, penYul, "BULK sudah disetujui", 1);
  await prisma.pekerjaanHarian.update({ where: { id: E.sudah }, data: { statusVerifikasi: "DISETUJUI" } });
  E.kunci = await catat(yul.request, penYul, "BULK untuk uji kunci", 1);
  for (const x of [ketua, ketua2, yul, rina, sari]) await x.tutup();
  expect(dua20).toHaveLength(20);
});

test("bulk ditolak seluruhnya bila ada catatan tim lain / sudah disetujui / duplikat / kosong / terlalu banyak", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const a = dua20[0];
  const b = dua20[1];

  const lintasTim = await bulk(ketua.request, [a, b, E.sari]);
  expect(lintasTim.status()).toBe(403);
  const bodyLintas = await lintasTim.json();
  expect(bodyLintas.pesan).toContain("Seluruh pilihan ditolak");
  expect(bodyLintas.masalah).toHaveLength(1);
  expect(bodyLintas.masalah[0].id).toBe(E.sari);

  const sudah = await bulk(ketua.request, [a, E.sudah]);
  expect(sudah.status()).toBe(409);
  expect((await sudah.json()).pesan).toContain("tidak sedang menunggu verifikasi");

  expect((await bulk(ketua.request, [a, a])).status()).toBe(400);
  expect((await bulk(ketua.request, [])).status()).toBe(400);
  expect((await bulk(ketua.request, Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`))).status()).toBe(400);
  expect((await bulk(ketua.request, ["00000000-0000-4000-8000-000000000999"])).status()).toBe(404);

  // Tidak ada yang berubah akibat penolakan di atas.
  expect(await status(a)).toBe("MENUNGGU");
  expect(await status(b)).toBe("MENUNGGU");
  expect(await status(E.sari)).toBe("MENUNGGU");
  expect(await prisma.verifikasi.count({ where: { pekerjaanHarianId: { in: [a, b, E.sari] } } })).toBe(0);

  // Periode dikunci -> seluruh batch ditolak.
  await prisma.periode.update({ where: { id: periodeId }, data: { status: "DIKUNCI" } });
  try {
    const r = await bulk(ketua.request, [a, E.kunci]);
    expect(r.status()).toBe(409);
    expect((await r.json()).pesan).toContain("dikunci");
  } finally {
    await prisma.periode.update({ where: { id: periodeId }, data: { status: "AKTIF" } });
  }
  expect(await status(a)).toBe("MENUNGGU");
  await ketua.tutup();
});

test("bulk hanya untuk ketua tim: pegawai, pimpinan, admin, ketua tim lain → 403", async ({ browser }) => {
  for (const nip of [USERS.yul.nip, USERS.pimpinan.nip, USERS.admin.nip]) {
    const u = await sebagai(browser, nip);
    expect((await bulk(u.request, [dua20[0]])).status(), nip).toBe(403);
    await u.tutup();
  }
  const k2 = await sebagai(browser, USERS.ketua2.nip);
  const r = await bulk(k2.request, [dua20[0]]);
  expect(r.status()).toBe(403);
  await k2.tutup();
  expect(await status(dua20[0])).toBe("MENUNGGU");
});

test("bulk 20 entri sukses dalam satu transaksi: status, riwayat, dan progres alokasi benar", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const mulai = Date.now();
  const r = await bulk(ketua.request, dua20);
  expect(r.status()).toBe(200);
  expect(Date.now() - mulai, "20 entri < 10 detik via API").toBeLessThan(10_000);
  const body = await r.json();
  expect(body.jumlah).toBe(20);
  expect(body.hasil).toHaveLength(20);

  for (const id of dua20) expect(await status(id)).toBe("DISETUJUI");
  expect(await prisma.verifikasi.count({ where: { pekerjaanHarianId: { in: dua20 }, aksi: "SETUJUI" } })).toBe(20);
  const pen = async (id: string) => prisma.penugasanAlokasi.findUniqueOrThrow({ where: { id } });
  expect(Number((await pen(penYul)).realisasi)).toBe(10 * 2 + 1); // 10 entri bulk + 1 entri DISETUJUI manual
  expect(Number((await pen(penRina)).realisasi)).toBe(10 * 3);
  expect(Number((await pen(penYul)).menunggu)).toBe(1); // sisa: entri uji kunci
  expect(await prisma.auditLog.count({ where: { aksi: "VERIFIKASI_BULK_SETUJUI", metadata: { path: ["ids"], array_contains: dua20[0] } } })).toBe(1);
  await ketua.tutup();
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("pilih beberapa → konfirmasi (jumlah & daftar tanggal) → hasil per catatan; batch gagal menampilkan penyebab", async ({ browser }) => {
    // Siapkan 5 entri baru agar antrean UI berisi data yang dikenal.
    const ketuaApi = await sebagai(browser, USERS.ketua.nip);
    const yul = await sebagai(browser, USERS.yul.nip);
    const baru: string[] = [];
    for (let i = 0; i < 5; i++) baru.push(await catat(yul.request, penYul, `BULK UI ${i}`, 1, i < 3 ? "2026-10-14" : "2026-10-13"));
    await yul.tutup();

    const page = ketuaApi.page;
    await page.goto("/verifikasi", { waitUntil: "networkidle" });
    for (const id of baru.slice(0, 4)) await page.locator(`[data-entri="${id}"]`).getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Setujui terpilih (4)" })).toBeVisible();

    // Satu catatan diproses pihak lain sebelum konfirmasi -> seluruh batch ditolak, tidak ada yang berubah.
    const lain = await sebagai(browser, USERS.ketua.nip);
    expect((await lain.request.post(`/api/pekerjaan-harian/${baru[0]}/verifikasi`, { data: { aksi: "SETUJUI" } })).status()).toBe(200);
    await lain.tutup();

    await page.getByRole("button", { name: "Setujui terpilih (4)" }).click();
    const dlg = page.getByRole("dialog", { name: "Konfirmasi setujui terpilih" });
    await expect(dlg.getByRole("heading", { name: "Setujui 4 catatan?" })).toBeVisible();
    await expect(dlg.getByText("Rabu, 14 Okt 2026 — Yul Pegawai").first()).toBeVisible();
    await dlg.getByRole("button", { name: "Setujui 4 catatan" }).click();
    await expect(dlg.getByRole("alert")).toContainText("Seluruh pilihan ditolak");
    for (const id of baru.slice(1, 4)) expect(await status(id), "tidak ada yang berubah").toBe("MENUNGGU");
    await dlg.getByRole("button", { name: "Batal" }).click();

    // Setelah antrean dimuat ulang, pilihan yang sudah tidak ada terbuang; setujui 3 sisanya.
    await expect(page.getByRole("button", { name: "Setujui terpilih (3)" })).toBeVisible();
    const mulai = Date.now();
    await page.getByRole("button", { name: "Setujui terpilih (3)" }).click();
    const dlg2 = page.getByRole("dialog", { name: "Konfirmasi setujui terpilih" });
    await expect(dlg2.getByRole("heading", { name: "Setujui 3 catatan?" })).toBeVisible();
    expect((await dlg2.getByRole("button", { name: "Setujui 3 catatan" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await dlg2.getByRole("button", { name: "Setujui 3 catatan" }).click();

    const hasil = page.getByRole("region", { name: "Hasil setujui terpilih" });
    await expect(hasil).toBeVisible();
    await expect(hasil.getByText("Disetujui")).toHaveCount(3);
    await expect(page.getByText("3 catatan disetujui.")).toBeVisible();
    expect(Date.now() - mulai).toBeLessThan(60_000);
    for (const id of baru.slice(1, 4)) expect(await status(id)).toBe("DISETUJUI");
    expect(await status(baru[4]), "yang tidak dipilih tetap menunggu").toBe("MENUNGGU");
    await ketuaApi.tutup();
  });
});
