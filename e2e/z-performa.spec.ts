import { expect, test } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { USERS } from "./support/data";
import { sebagai } from "./support/api";
import { isiDataBesar, persentil } from "./support/data-besar";

// Berjalan terakhir (z-): menambah data besar yang tidak boleh mengganggu spec lain.
const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

let besar: Awaited<ReturnType<typeof isiDataBesar>>;

test("siapkan data beban: 100 pegawai × hari kerja × 3 entri", async () => {
  test.setTimeout(300_000);
  const periode = await prisma.periode.findFirstOrThrow({ where: { status: "AKTIF" } });
  besar = await isiDataBesar(prisma, periode.id);
  expect(besar.jumlahPegawai).toBe(100);
  expect(besar.jumlahEntri, "≈ 100 × 21 hari kerja × 3").toBeGreaterThanOrEqual(6000);
});

test("KPI dashboard: p95 ≤ 2,0 detik pada beban 1 periode × 100 pegawai", async ({ browser }) => {
  test.setTimeout(300_000);
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  await pim.request.get("/api/dashboard/ringkasan"); // pemanasan koneksi/cache
  const durasi: number[] = [];
  for (let i = 0; i < 40; i++) {
    const t0 = performance.now();
    const r = await pim.request.get("/api/dashboard/ringkasan");
    durasi.push(performance.now() - t0);
    expect(r.status()).toBe(200);
  }
  const p50 = persentil(durasi, 50);
  const p95 = persentil(durasi, 95);
  console.log(`KPI ringkasan: p50=${p50.toFixed(0)} ms, p95=${p95.toFixed(0)} ms (40 permintaan, ${besar.jumlahEntri} entri)`);
  expect(p95).toBeLessThanOrEqual(2000);

  const body = await (await pim.request.get("/api/dashboard/ringkasan")).json();
  expect(body.kpi.totalEntri).toBeGreaterThanOrEqual(besar.jumlahEntri);
  expect(body.kpi.pegawaiAktif).toBeGreaterThanOrEqual(100);
  await pim.tutup();
});

test("tabel per pegawai & drill-down: p95 ≤ 2,0 detik pada beban 100 pegawai", async ({ browser }) => {
  test.setTimeout(300_000);
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const ukur = async (url: string, n = 30) => {
    await pim.request.get(url);
    const d: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      const r = await pim.request.get(url);
      d.push(performance.now() - t0);
      expect(r.status()).toBe(200);
    }
    return { p50: persentil(d, 50), p95: persentil(d, 95) };
  };

  const tabel = await ukur("/api/dashboard/pegawai");
  console.log(`Tabel pegawai: p50=${tabel.p50.toFixed(0)} ms, p95=${tabel.p95.toFixed(0)} ms`);
  expect(tabel.p95).toBeLessThanOrEqual(2000);

  const body = await (await pim.request.get("/api/dashboard/pegawai")).json();
  expect(body.data.length).toBeGreaterThanOrEqual(100);
  const contoh = (body.data as { userId: string; nama: string }[]).find((x) => x.nama.startsWith("Pegawai Besar"))!;
  const rinci = await ukur(`/api/dashboard/pegawai/${contoh.userId}`);
  console.log(`Drill-down 1 pegawai: p50=${rinci.p50.toFixed(0)} ms, p95=${rinci.p95.toFixed(0)} ms`);
  expect(rinci.p95).toBeLessThanOrEqual(2000);

  // Endpoint gabungan (KPI + tabel + analitik/heatmap 100 pegawai) dan halaman profil (render server).
  const lengkap = await ukur("/api/dashboard");
  console.log(`Dashboard lengkap: p50=${lengkap.p50.toFixed(0)} ms, p95=${lengkap.p95.toFixed(0)} ms`);
  expect(lengkap.p95).toBeLessThanOrEqual(2000);
  const profil = await ukur(`/dashboard/pegawai/${contoh.userId}`, 15);
  console.log(`Halaman profil: p50=${profil.p50.toFixed(0)} ms, p95=${profil.p95.toFixed(0)} ms`);
  expect(profil.p95).toBeLessThanOrEqual(2000);
  await pim.tutup();
});

test("ekspor XLSX 1 periode penuh (100+ pegawai) ≤ 60 detik dan tidak memblokir permintaan lain", async ({ browser }) => {
  test.setTimeout(300_000);
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const t0 = performance.now();
  const [ekspor, health] = await Promise.all([
    pim.request.get("/api/dashboard/export"),
    (async () => {
      await new Promise((r) => setTimeout(r, 50));
      const t = performance.now();
      const r = await pim.request.get("/api/health");
      return { status: r.status(), ms: performance.now() - t };
    })(),
  ]);
  const detik = (performance.now() - t0) / 1000;
  expect(ekspor.status()).toBe(200);
  const body = await ekspor.json();
  console.log(`Ekspor ${body.jumlahBaris} baris: ${detik.toFixed(1)} s, ${(body.ukuranBytes / 1024).toFixed(0)} KB; /api/health saat ekspor: ${health.ms.toFixed(0)} ms`);
  expect(detik).toBeLessThanOrEqual(60);
  expect(body.jumlahBaris).toBeGreaterThanOrEqual(100);
  expect(health.status).toBe(200);
  expect(health.ms, "permintaan lain tetap responsif selama ekspor").toBeLessThan(2000);
  await pim.tutup();
});

test("generate rekap 1 periode penuh (100+ pegawai) selesai ≤ 60 detik", async ({ browser }) => {
  test.setTimeout(300_000);
  const admin = await sebagai(browser, USERS.admin.nip);
  const periode = await prisma.periode.findFirstOrThrow({ where: { status: "AKTIF" } });
  const t0 = Date.now();
  const r = await admin.request.post("/api/rekap/generate", { data: { periodeId: periode.id } });
  expect(r.status()).toBe(202);
  const { jumlah } = await r.json();
  expect(jumlah).toBeGreaterThanOrEqual(100);
  for (;;) {
    const d = await (await admin.request.get(`/api/rekap/${periode.id}`)).json();
    if (!d.sedangBerjalan) {
      const status = (d.data as { rekap: { status: string } | null }[]).map((x) => x.rekap?.status);
      console.log(`Rekap ${jumlah} pegawai: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      expect(status.every((s) => s === "SELESAI")).toBe(true);
      break;
    }
    expect(Date.now() - t0, "batas 60 detik").toBeLessThan(60_000);
    await new Promise((r) => setTimeout(r, 500));
  }
  expect((Date.now() - t0) / 1000).toBeLessThanOrEqual(60);
  await admin.tutup();
});
