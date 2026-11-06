import ExcelJS from "exceljs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import bcrypt from "bcryptjs";
import { E2E_PASSWORD, USERS } from "./support/data";
import { anggotaTim, buatAlokasi, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

let periodeId = "";
let timA = "";
let timB = "";
let yulId = "";
const NAMA_JAHAT = "=HYPERLINK(\"http://jahat.example\",\"klik\")";

type Hasil = { url: string; namaFile: string; jumlahBaris: number; ukuranBytes: number };
const ekspor = async (request: APIRequestContext, qs = "") => {
  const r = await request.get(`/api/dashboard/export${qs}`);
  expect(r.status()).toBe(200);
  return (await r.json()) as Hasil;
};
/** Unduh lewat signed URL (tanpa cookie sesi) lalu baca workbook. */
async function bacaWorkbook(request: APIRequestContext, url: string) {
  const res = await request.get(url);
  expect(res.status()).toBe(200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await res.body()) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return { wb, res };
}
function barisData(ws: ExcelJS.Worksheet) {
  const out: ExcelJS.CellValue[][] = [];
  let mulai = 0;
  ws.eachRow((row, n) => {
    if (row.getCell(1).value === "No") mulai = n;
    else if (mulai && n > mulai) out.push((row.values as ExcelJS.CellValue[]).slice(1));
  });
  return out;
}

test("setup: ada pegawai bernama berbahaya (formula) di Tim A", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  timA = (await timMilik(ketua.request)).id;
  timB = (await timMilik(ketua2.request)).id;
  yulId = (await anggotaTim(ketua.request, timA, periodeId))(USERS.yul.nama);
  const jahat = await prisma.user.create({
    data: { nip: "199900000000000001", nama: NAMA_JAHAT, role: "PEGAWAI", passwordHash: await bcrypt.hash(E2E_PASSWORD, 4) },
  });
  await prisma.anggotaTim.create({ data: { timId: timA, userId: jahat.id, periodeId } });
  await ketua.tutup();
  await ketua2.tutup();
});

test("ekspor mengikuti filter, berisi tabel yang sama dengan API, dan diunduh lewat signed URL", async ({ browser, request }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const hasil = await ekspor(ketua.request);
  expect(hasil.namaFile).toMatch(/^Dashboard-Oktober-2026-.+\.xlsx$/);

  const u = new URL(hasil.url);
  expect(u.searchParams.get("X-Amz-Signature")).toBeTruthy();
  expect(Number(u.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);

  const { wb, res } = await bacaWorkbook(request, hasil.url);
  expect(res.headers()["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  expect(res.headers()["content-disposition"]).toContain("attachment");
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Per Pegawai", "Ringkasan KPI"]);

  const tabel = (await (await ketua.request.get("/api/dashboard/pegawai")).json()) as { data: { nama: string; nip: string; jumlahEntri: number; hariTerisi: number; entriMenunggu: number }[] };
  const baris = barisData(wb.getWorksheet("Per Pegawai")!);
  expect(baris).toHaveLength(tabel.data.length);
  expect(hasil.jumlahBaris).toBe(tabel.data.length);
  tabel.data.forEach((r, i) => {
    const sel = baris[i];
    expect(sel[0]).toBe(i + 1);
    expect(sel[1]).toBe(r.nip);
    expect(String(sel[2])).toContain(r.nama.replace(/^=/, "")); // nama berbahaya diberi awalan '
    expect(sel[4]).toBe(r.jumlahEntri);
    expect(sel[7]).toBe(r.hariTerisi);
    expect(sel[9]).toBe(r.entriMenunggu);
  });
  // Hanya anggota Tim A (ketua A tidak melihat Tim B).
  expect(baris.some((r) => String(r[2]).includes(USERS.sari.nama))).toBe(false);

  const kpi = wb.getWorksheet("Ringkasan KPI")!;
  expect(kpi.getCell("A2").value).toBe("Pegawai aktif");
  const api = (await (await ketua.request.get("/api/dashboard/ringkasan")).json()).kpi;
  expect(kpi.getCell("B2").value).toBe(api.pegawaiAktif);
  expect(kpi.getCell("B3").value).toBe(api.alokasiPeriodeIni);
  await ketua.tutup();
});

test("filter pegawai/tim diterapkan pada ekspor; audit dicatat", async ({ browser, request }) => {
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const satu = await ekspor(pim.request, `?userId=${yulId}`);
  expect(satu.jumlahBaris).toBe(1);
  const wbSatu = (await bacaWorkbook(request, satu.url)).wb;
  expect(String(barisData(wbSatu.getWorksheet("Per Pegawai")!)[0][2])).toContain(USERS.yul.nama);

  const b = await ekspor(pim.request, `?timId=${timB}`);
  expect(b.jumlahBaris).toBe(2);
  expect(b.namaFile).toContain("Tim-Umum");
  const wbB = (await bacaWorkbook(request, b.url)).wb;
  const namaB = barisData(wbB.getWorksheet("Per Pegawai")!).map((r) => String(r[2])).sort();
  expect(namaB).toEqual([USERS.ketua2.nama, USERS.sari.nama].sort());

  const semua = await ekspor(pim.request);
  expect(semua.jumlahBaris).toBeGreaterThan(b.jumlahBaris);
  expect(await prisma.auditLog.count({ where: { aksi: "EKSPOR_DASHBOARD" } })).toBeGreaterThanOrEqual(3);
  await pim.tutup();
});

test("keamanan: nama berformula ditulis sebagai teks (awalan '), tanpa sesi tidak bisa membuat ekspor, peran dibatasi", async ({ browser, request }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const wb = (await bacaWorkbook(request, (await ekspor(ketua.request)).url)).wb;
  const ws = wb.getWorksheet("Per Pegawai")!;
  const nama = barisData(ws).map((r) => String(r[2])).find((n) => n.includes("jahat.example"))!;
  expect(nama.startsWith("'=")).toBe(true);
  // Tidak ada sel berformula di seluruh sheet.
  ws.eachRow((row) => row.eachCell((c) => expect(typeof c.value === "object" && c.value !== null && "formula" in (c.value as object)).toBe(false)));

  expect((await ketua.request.get(`/api/dashboard/export?timId=${timB}`)).status(), "ketua A minta tim B").toBe(403);
  await ketua.tutup();
  const yulSesi = await sebagai(browser, USERS.yul.nip);
  expect((await yulSesi.request.get("/api/dashboard/export")).status(), "pegawai").toBe(403);
  await yulSesi.tutup();
  // Admin ikut memantau seluruh tim (sama seperti pimpinan).
  const adminSesi = await sebagai(browser, USERS.admin.nip);
  expect((await adminSesi.request.get("/api/dashboard/export")).status(), "admin").toBe(200);
  await adminSesi.tutup();
  expect((await request.get("/api/dashboard/export")).status()).toBe(401);
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("tombol Ekspor: indikator proses, UI tetap dapat dipakai, file terunduh", async ({ browser }) => {
    const pim = await sebagai(browser, USERS.pimpinan.nip);
    const page = pim.page;
    await page.route("**/api/dashboard/export**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    const tombol = page.getByRole("button", { name: "Ekspor XLSX" });
    await expect(tombol).toBeEnabled();
    expect((await tombol.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    const unduhan = page.waitForEvent("download");
    await tombol.click();
    await expect(page.getByRole("button", { name: "Menyiapkan ekspor…" })).toBeDisabled();
    // Selama ekspor berjalan, filter tetap bisa dipakai (tidak memblokir UI).
    await expect(page.getByLabel("Tim kerja", { exact: true })).toBeEnabled();
    await page.getByLabel("Tim kerja", { exact: true }).selectOption({ label: "Tim Umum" });
    const d = await unduhan;
    expect(d.suggestedFilename()).toMatch(/\.xlsx$/);
    await expect(page.getByText(/Ekspor siap: .+\.xlsx/)).toBeVisible();
    await pim.tutup();
  });

  test("lonceng notifikasi: jumlah belum dibaca akurat, daftar terbaru, tandai dibaca, tandai semua", async ({ browser }) => {
    const ketua = await sebagai(browser, USERS.ketua.nip);
    const periode = await periodeAktif(ketua.request);
    const tim = await timMilik(ketua.request);
    const u = await anggotaTim(ketua.request, tim.id, periode.id);
    await buatAlokasi(ketua.request, { timId: tim.id, periodeId: periode.id, judul: "Alokasi untuk lonceng", userIds: [u(USERS.tari.nama)] });
    await ketua.tutup();

    const tari = await sebagai(browser, USERS.tari.nip);
    const page = tari.page;
    const api = async () => (await (await tari.request.get("/api/notifikasi?pageSize=100")).json()) as { belumDibaca: number; data: { isRead: boolean; judul: string }[] };
    const label = (n: number) => (n > 0 ? `Notifikasi, ${n} belum dibaca` : "Notifikasi, tidak ada yang baru");
    const sebelum = await api();
    expect(sebelum.belumDibaca).toBeGreaterThanOrEqual(1);

    await page.goto("/hari-ini", { waitUntil: "networkidle" });
    const lonceng = page.getByRole("button", { name: /^Notifikasi/ });
    expect((await lonceng.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(lonceng).toHaveAttribute("aria-label", label(sebelum.belumDibaca));
    await expect(page.getByTestId("jumlah-notifikasi")).toHaveText(String(Math.min(sebelum.belumDibaca, 99)));

    await lonceng.click();
    const panel = page.getByRole("region", { name: "Daftar notifikasi" });
    await expect(panel.getByText("Alokasi baru").first()).toBeVisible();
    await expect(panel.getByText(/Alokasi untuk lonceng/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    // Klik satu notifikasi: ditandai dibaca (hitungan turun 1) dan membuka tautannya.
    await panel.locator('[data-baca="belum"]').first().click();
    await expect(page).toHaveURL(/\/hari-ini/);
    await expect.poll(async () => (await api()).belumDibaca).toBe(sebelum.belumDibaca - 1);
    await expect(lonceng).toHaveAttribute("aria-label", label(sebelum.belumDibaca - 1));

    // Tandai semua dibaca: lencana hilang (siapkan satu notifikasi belum dibaca agar tombol aktif).
    await prisma.notifikasi.create({ data: { userId: (await prisma.user.findUniqueOrThrow({ where: { nip: USERS.tari.nip } })).id, tipe: "PENGINGAT_HARIAN", judul: "Pengingat uji", isi: "Isi catatan hari ini." } });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByTestId("jumlah-notifikasi")).toHaveText(String(sebelum.belumDibaca)); // (n - 1 dibaca) + 1 baru
    await lonceng.click();
    await page.getByRole("button", { name: "Tandai semua dibaca" }).click();
    await expect(page.getByTestId("jumlah-notifikasi")).toHaveCount(0);
    await expect(lonceng).toHaveAttribute("aria-label", "Notifikasi, tidak ada yang baru");
    expect((await api()).belumDibaca).toBe(0);

    // Esc menutup panel.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await tari.tutup();
  });
});
