import { expect, test, type Page } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { contohDocx, contohExe, contohPdf } from "../lib/testing/mini-zip";
import { E2E_PASSWORD, USERS } from "./support/data";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());

test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });
test.describe.configure({ mode: "serial" });

let penugasanRina = "";

async function login(page: Page, nip: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("NIP atau email").fill(nip);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Foto besar sungguhan (>1 MB) dibuat di browser agar kompresi canvas bisa diuji. */
async function fotoBesar(page: Page) {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 2600;
    c.height = 1800;
    const x = c.getContext("2d")!;
    for (let i = 0; i < c.width; i += 5) {
      for (let j = 0; j < c.height; j += 5) {
        x.fillStyle = `rgb(${(i * 7 + j * 3) % 256},${(i * 5 + j * 11) % 256},${(i ^ j) % 256})`;
        x.fillRect(i, j, 5, 5);
      }
    }
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.97));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}

async function bukaForm(page: Page) {
  await page.goto("/hari-ini", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "+ Catat Pekerjaan" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Alokasi pekerjaan").selectOption({ label: "UI bukti" });
  return form;
}

test("setup: ketua membuat alokasi untuk Rina", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, USERS.ketua.nip);
  const periode = ((await (await page.request.get("/api/periode")).json()).data as { id: string; status: string }[]).find((p) => p.status === "AKTIF")!;
  const tim = (await (await page.request.get("/api/tim")).json()).data[0] as { id: string };
  const anggota = (await (await page.request.get(`/api/tim/${tim.id}/anggota?periodeId=${periode.id}`)).json()).anggota as { userId: string; nama: string }[];
  const r = await page.request.post("/api/alokasi", {
    data: {
      timId: tim.id,
      periodeId: periode.id,
      judul: "UI bukti",
      deskripsi: "uji ui bukti",
      tanggalMulai: "2026-10-01",
      tanggalSelesai: "2026-10-30",
      targetVolume: 100,
      satuan: "dokumen",
      prioritas: "TINGGI",
      penugasan: [{ userId: anggota.find((a) => a.nama === USERS.rina.nama)!.userId }],
    },
  });
  expect(r.status()).toBe(201);
  penugasanRina = (await r.json()).alokasi.penugasan[0].id;
  await ctx.close();
});

test("foto dikompres, progres tampil, thumbnail & pratinjau inline; docx berupa ikon + unduh; indikator Ada bukti", async ({ page }) => {
  await login(page, USERS.rina.nip);
  const asli = await fotoBesar(page);
  expect(asli.length, "foto uji harus > 1 MB").toBeGreaterThan(1024 * 1024);

  // Tahan permintaan unggah agar status "Mengunggah…" dan progress bar bisa diamati.
  await page.route("**/api/pekerjaan-harian/*/bukti", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });

  const form = await bukaForm(page);
  // Dua jalur: kamera (capture) dan berkas.
  await expect(form.getByLabel("Ambil foto")).toHaveAttribute("capture", "environment");
  const tombolPilih = form.getByText("Pilih file", { exact: true });
  expect((await tombolPilih.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const input = form.getByLabel("Pilih file");
  await input.setInputFiles([
    { name: "foto kegiatan.jpg", mimeType: "image/jpeg", buffer: asli },
    { name: "laporan.pdf", mimeType: "application/pdf", buffer: contohPdf() },
    { name: "notulen.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: contohDocx() },
  ]);
  await expect(form.getByAltText("Pratinjau foto kegiatan.jpg")).toBeVisible(); // thumbnail sebelum unggah
  await expect(form.getByText("laporan.pdf")).toBeVisible();

  await form.getByLabel("Deskripsi capaian").fill("Entri dengan tiga bukti");
  await form.getByRole("button", { name: "Simpan" }).click();

  await expect(form.getByText("Mengunggah…").first()).toBeVisible();
  await expect(form.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", /^\d+$/);

  await expect(page.getByText("Catatan tersimpan.").first()).toBeVisible({ timeout: 20_000 });
  const kartu = page.getByRole("listitem").filter({ hasText: "Entri dengan tiga bukti" });
  await expect(kartu.getByText("Ada bukti (3)")).toBeVisible();

  // Basis data: kompresi benar-benar memperkecil foto.
  const entri = await prisma.pekerjaanHarian.findFirstOrThrow({ where: { deskripsiCapaian: "Entri dengan tiga bukti" }, include: { bukti: true } });
  expect(entri.bukti).toHaveLength(3);
  const jpg = entri.bukti.find((b) => b.mimeType === "image/jpeg")!;
  expect(Number(jpg.ukuranBytes), "foto dikompres sebelum unggah").toBeLessThan(asli.length);
  expect(jpg.namaAsli).toBe("foto kegiatan.jpg");

  // Daftar bukti & pratinjau inline.
  await kartu.getByRole("button", { name: "Lihat bukti" }).click();
  await expect(kartu.locator('[data-jenis="dokumen"]').getByRole("link", { name: "Unduh" })).toHaveAttribute("href", /\/download\?unduh=1$/);
  await kartu.getByRole("button", { name: "Lihat foto kegiatan.jpg" }).click();
  const pratinjau = page.getByRole("dialog", { name: "Pratinjau bukti" });
  const img = pratinjau.getByRole("img", { name: "foto kegiatan.jpg" });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
  expect(await img.evaluate((e: HTMLImageElement) => Math.max(e.naturalWidth, e.naturalHeight))).toBeLessThanOrEqual(1600);
  await pratinjau.getByRole("button", { name: "Tutup" }).click();

  await kartu.locator('[data-jenis="pdf"]').getByRole("button", { name: "Lihat" }).click();
  await expect(page.getByRole("dialog", { name: "Pratinjau bukti" }).locator("iframe")).toHaveAttribute("src", /\/api\/bukti\/[0-9a-f-]{36}\/download$/);
  await page.getByRole("dialog", { name: "Pratinjau bukti" }).getByRole("button", { name: "Tutup" }).click();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("file ditolak sisi klien: .exe dan > 10 MB; indikator Belum ada bukti untuk entri tanpa lampiran", async ({ page }) => {
  await login(page, USERS.rina.nip);
  const form = await bukaForm(page);
  const input = form.getByLabel("Pilih file");

  await input.setInputFiles({ name: "program.exe", mimeType: "application/octet-stream", buffer: contohExe() });
  await expect(form.getByRole("alert").filter({ hasText: "program.exe: Tipe file tidak didukung" })).toBeVisible();

  await input.setInputFiles({ name: "terlalu-besar.pdf", mimeType: "application/pdf", buffer: Buffer.concat([contohPdf(), Buffer.alloc(10 * 1024 * 1024)]) });
  await expect(form.getByRole("alert").filter({ hasText: "terlalu-besar.pdf: Ukuran file melebihi batas 10 MB." })).toBeVisible();
  await expect(form.getByText("terlalu-besar.pdf", { exact: true })).toHaveCount(0); // tidak masuk antrean

  await form.getByLabel("Deskripsi capaian").fill("Entri tanpa bukti");
  await form.getByRole("button", { name: "Simpan" }).click();
  const kartu = page.getByRole("listitem").filter({ hasText: "Entri tanpa bukti" });
  await expect(kartu.getByText("Belum ada bukti")).toBeVisible();
});

test("koneksi putus saat unggah: Coba lagi berhasil tanpa menduplikasi file", async ({ page }) => {
  await login(page, USERS.rina.nip);
  let percobaan = 0;
  await page.route("**/api/pekerjaan-harian/*/bukti", async (route) => {
    percobaan++;
    if (percobaan === 1) {
      // Server menyimpan file, tetapi respons hilang di jalan -> klien melihat kegagalan jaringan.
      await route.fetch();
      await route.abort("connectionreset");
    } else {
      await route.continue();
    }
  });

  const form = await bukaForm(page);
  await form.getByLabel("Pilih file").setInputFiles({ name: "bukti-retry.pdf", mimeType: "application/pdf", buffer: contohPdf() });
  await form.getByLabel("Deskripsi capaian").fill("Entri uji coba lagi");
  await form.getByRole("button", { name: "Simpan" }).click();

  await expect(form.getByText("Gagal: Koneksi terputus. Periksa jaringan lalu coba lagi.")).toBeVisible();
  await expect(form.getByText("Catatan tersimpan.")).toBeVisible();
  // Catatan tidak tersimpan ganda; hanya unggah yang diulang.
  expect(await prisma.pekerjaanHarian.count({ where: { deskripsiCapaian: "Entri uji coba lagi" } })).toBe(1);

  await form.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(page.getByText("Catatan tersimpan.").first()).toBeVisible();
  const kartu = page.getByRole("listitem").filter({ hasText: "Entri uji coba lagi" });
  await expect(kartu.getByText("Ada bukti")).toBeVisible();

  const entri = await prisma.pekerjaanHarian.findFirstOrThrow({ where: { deskripsiCapaian: "Entri uji coba lagi" }, include: { bukti: true } });
  expect(entri.bukti, "tidak ada duplikat setelah coba lagi").toHaveLength(1);
  expect(entri.penugasanId).toBe(penugasanRina);
});
