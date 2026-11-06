import { expect, test } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { FAKE_TODAY, USERS } from "./support/data";
import { sebagai } from "./support/api";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

type Analitik = {
  hariKerja: string[];
  tren: { tanggal: string; entri: number; disetujui: number; menunggu: number; revisi: number; pegawai: number }[];
  perTim: { id: string; nama: string; anggota: number; entri: number; persenKepatuhan: number | null }[];
  status: { disetujui: number; menunggu: number; revisi: number };
  heatmap: { userId: string; nama: string; sel: number[]; terisi: number }[];
};

/** Entri periode aktif milik anggota tim (cakupan pimpinan), dihitung langsung dari tabel. */
async function entriCakupan() {
  const periode = await prisma.periode.findFirstOrThrow({ where: { status: "AKTIF" } });
  const anggota = await prisma.anggotaTim.findMany({ where: { periodeId: periode.id }, select: { userId: true } });
  const userIds = [...new Set(anggota.map((a) => a.userId))];
  const rows = await prisma.pekerjaanHarian.findMany({ where: { periodeId: periode.id, userId: { in: userIds } }, select: { userId: true, tanggal: true, statusVerifikasi: true } });
  return { periode, rows: rows.map((r) => ({ ...r, tanggal: r.tanggal.toISOString().slice(0, 10) })) };
}

test("API gabungan: KPI, tabel, dan analitik konsisten dengan hitungan independen", async ({ browser }) => {
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const r = await pim.request.get("/api/dashboard");
  expect(r.status()).toBe(200);
  const body = (await r.json()) as { ringkasan: { kpi: { totalEntri: number } }; tabel: { data: unknown[] }; analitik: Analitik };
  const a = body.analitik;
  const { rows } = await entriCakupan();

  // Sebaran status mencakup seluruh entri periode.
  expect(a.status.disetujui).toBe(rows.filter((x) => x.statusVerifikasi === "DISETUJUI").length);
  expect(a.status.menunggu).toBe(rows.filter((x) => x.statusVerifikasi === "MENUNGGU").length);
  expect(a.status.revisi).toBe(rows.filter((x) => x.statusVerifikasi === "MINTA_REVISI" || x.statusVerifikasi === "DITOLAK").length);
  expect(a.status.disetujui + a.status.menunggu + a.status.revisi).toBe(body.ringkasan.kpi.totalEntri);

  // Tren hanya hari kerja yang sudah berjalan (s.d. tanggal uji), urut naik.
  expect(a.hariKerja.every((t) => t <= FAKE_TODAY)).toBe(true);
  expect([...a.hariKerja].sort()).toEqual(a.hariKerja);
  const hk = new Set(a.hariKerja);
  expect(a.tren.reduce((s, t) => s + t.entri, 0)).toBe(rows.filter((x) => hk.has(x.tanggal)).length);
  for (const t of a.tren) {
    expect(t.pegawai).toBe(new Set(rows.filter((x) => x.tanggal === t.tanggal).map((x) => x.userId)).size);
  }

  // Heatmap: sel sepanjang hari kerja; urut dari yang paling jarang mengisi.
  for (const h of a.heatmap) expect(h.sel).toHaveLength(a.hariKerja.length);
  const terisi = a.heatmap.map((h) => h.terisi);
  expect([...terisi].sort((x, y) => x - y)).toEqual(terisi);
  const yul = a.heatmap.find((h) => h.nama === USERS.yul.nama)!;
  expect(yul.terisi).toBe(new Set(rows.filter((x) => x.userId === yul.userId && hk.has(x.tanggal)).map((x) => x.tanggal)).size);

  // Kepatuhan per tim dalam rentang 0–100.
  for (const t of a.perTim) {
    if (t.persenKepatuhan === null) continue;
    expect(t.persenKepatuhan).toBeGreaterThanOrEqual(0);
    expect(t.persenKepatuhan).toBeLessThanOrEqual(100);
  }
  await pim.tutup();
});

test("ketua tim hanya melihat analitik timnya sendiri", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const b = await (await ketua.request.get("/api/dashboard")).json();
  const milik = await prisma.timKerja.findMany({ where: { ketua: { nip: USERS.ketua.nip } }, select: { id: true } });
  expect((b.analitik as Analitik).perTim.map((t) => t.id).sort()).toEqual(milik.map((t) => t.id).sort());
  await ketua.tutup();
});

test("UI: grafik tampil, nama pada peta kepatuhan membuka profil; profil menolak pegawai di luar cakupan", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const page = ketua.page;
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Tren pengisian harian" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kepatuhan per tim" })).toBeVisible();
  const peta = page.getByRole("region", { name: "Peta kepatuhan pengisian" });
  await peta.getByRole("link", { name: USERS.yul.nama }).click();
  await page.waitForURL(/\/dashboard\/pegawai\/[0-9a-f-]+\?periodeId=/);
  await expect(page.getByRole("heading", { level: 1, name: USERS.yul.nama })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kalender pengisian" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Progres alokasi" })).toBeVisible();

  // Jumlah catatan di profil = entri Yul pada periode aktif.
  const yulId = page.url().match(/pegawai\/([0-9a-f-]+)/)![1];
  const periode = await prisma.periode.findFirstOrThrow({ where: { status: "AKTIF" } });
  const n = await prisma.pekerjaanHarian.count({ where: { userId: yulId, periodeId: periode.id } });
  await expect(page.getByRole("heading", { name: `Catatan pekerjaan (${n})` })).toBeVisible();
  expect(await page.locator("li[data-entri]").count()).toBe(n);
  await ketua.tutup();

  // Ketua tim lain: Yul bukan anggota timnya.
  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  await ketua2.page.goto(`/dashboard/pegawai/${yulId}`, { waitUntil: "networkidle" });
  await expect(ketua2.page.getByText("Pegawai tidak ditemukan pada cakupan Anda.")).toBeVisible();
  await ketua2.tutup();

  // Pegawai tidak boleh membuka profil sama sekali.
  const yul = await sebagai(browser, USERS.yul.nip);
  await yul.page.goto(`/dashboard/pegawai/${yulId}`, { waitUntil: "networkidle" });
  await expect(yul.page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible();
  expect((await yul.request.get("/api/dashboard")).status()).toBe(403);
  await yul.tutup();
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("grafik, peta kepatuhan, dan profil tampil tanpa scroll horizontal; menu tab bawah terlihat", async ({ browser }) => {
    const pim = await sebagai(browser, USERS.pimpinan.nip);
    const page = pim.page;
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Peta kepatuhan pengisian" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Menu utama" }).getByRole("link", { name: "Dashboard" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

    await page.getByRole("region", { name: "Peta kepatuhan pengisian" }).getByRole("link", { name: USERS.yul.nama }).click();
    await page.waitForURL(/\/dashboard\/pegawai\//);
    await expect(page.getByRole("heading", { level: 1, name: USERS.yul.nama })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await pim.tutup();
  });
});
