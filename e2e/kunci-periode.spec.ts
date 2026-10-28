import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { contohPdf } from "../lib/testing/mini-zip";
import { USERS } from "./support/data";
import { sebagai } from "./support/api";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

// Periode uji khusus (Juli 2026) agar penguncian tidak mengganggu spec lain.
let periodeId = "";
let timId = "";
const I: Record<string, string> = {};

const tgl = (s: string) => new Date(`${s}T00:00:00Z`);
const sc = async (r: Awaited<ReturnType<APIRequestContext["get"]>>) => ({ status: r.status(), pesan: ((await r.json().catch(() => ({}))) as { pesan?: string }).pesan });

test("setup: periode Juli 2026 berisi alokasi, entri (menunggu/revisi), dan bukti", async ({ browser }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const r = await admin.request.post("/api/periode", { data: { tahun: 2026, bulan: 7 } });
  expect(r.status()).toBe(201);
  periodeId = (await r.json()).periode.id;

  const u = async (nip: string) => (await prisma.user.findUniqueOrThrow({ where: { nip } })).id;
  I.ketua = await u(USERS.ketua.nip);
  I.yul = await u(USERS.yul.nip);
  I.rina = await u(USERS.rina.nip);
  timId = (await prisma.timKerja.findFirstOrThrow({ where: { ketuaId: I.ketua } })).id;
  for (const userId of [I.ketua, I.yul, I.rina]) {
    await prisma.anggotaTim.create({ data: { timId, userId, periodeId, peranDalamTim: userId === I.ketua ? "KETUA" : "ANGGOTA" } });
  }
  const al = await prisma.alokasi.create({
    data: {
      periodeId, timId, judul: "Alokasi Juli", deskripsi: "uji kunci", tanggalMulai: tgl("2026-07-01"), tanggalSelesai: tgl("2026-07-31"),
      targetVolume: 100, satuan: "dokumen", dibuatOlehId: I.ketua,
      penugasan: { create: [{ userId: I.yul, targetVolume: 100 }, { userId: I.rina, targetVolume: 100 }] },
    },
    include: { penugasan: true },
  });
  I.alokasi = al.id;
  I.penYul = al.penugasan.find((p) => p.userId === I.yul)!.id;
  I.penRina = al.penugasan.find((p) => p.userId === I.rina)!.id;

  const e = (userId: string, penugasanId: string, tanggal: string, status: "MENUNGGU" | "MINTA_REVISI" | "DISETUJUI", volume: number, desk: string) =>
    prisma.pekerjaanHarian.create({ data: { periodeId, penugasanId, userId, tanggal: tgl(tanggal), deskripsiCapaian: desk, volume, satuan: "dokumen", statusVerifikasi: status } });
  I.menunggu = (await e(I.yul, I.penYul, "2026-07-14", "MENUNGGU", 5, "KUNCI menunggu")).id;
  I.revisi = (await e(I.yul, I.penYul, "2026-07-15", "MINTA_REVISI", 4, "KUNCI revisi")).id;
  I.disetujui = (await e(I.yul, I.penYul, "2026-07-16", "DISETUJUI", 8, "KUNCI disetujui")).id;
  I.rina1 = (await e(I.rina, I.penRina, "2026-07-14", "MENUNGGU", 3, "KUNCI Rina menunggu")).id;
  await prisma.verifikasi.create({ data: { pekerjaanHarianId: I.revisi, verifikatorId: I.ketua, aksi: "MINTA_REVISI", catatan: "Perbaiki catatan ini." } });
  const b = await prisma.buktiDukung.create({
    data: { pekerjaanHarianId: I.menunggu, namaAsli: "bukti.pdf", objectKey: `uji/kunci/${I.menunggu}.pdf`, mimeType: "application/pdf", ukuranBytes: BigInt(100), checksumSha256: "a".repeat(64), uploadedById: I.yul },
  });
  I.bukti = b.id;
  await admin.tutup();
});

test("sebelum dikunci: pegawai/ketua tim tidak boleh mengunci; periode tak dikenal 404; tanpa sesi 401", async ({ browser, request }) => {
  for (const nip of [USERS.yul.nip, USERS.ketua.nip]) {
    const u = await sebagai(browser, nip);
    expect((await u.request.post(`/api/periode/${periodeId}/kunci`)).status(), nip).toBe(403);
    await u.tutup();
  }
  expect((await request.post(`/api/periode/${periodeId}/kunci`)).status()).toBe(401);
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  expect((await pim.request.post("/api/periode/00000000-0000-4000-8000-000000000999/kunci")).status()).toBe(404);
  expect((await prisma.periode.findUniqueOrThrow({ where: { id: periodeId } })).status).toBe("DRAFT");
  await pim.tutup();
});

test("PIMPINAN mengunci: status, penanda pengunci, audit, dan rekap final otomatis", async ({ browser }) => {
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const pimId = (await prisma.user.findUniqueOrThrow({ where: { nip: USERS.pimpinan.nip } })).id;
  const r = await pim.request.post(`/api/periode/${periodeId}/kunci`);
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.periode.status).toBe("DIKUNCI");
  expect(body.rekapFinal).toEqual({ dimulai: true, jumlah: 3 }); // ketua, Yul, Rina

  const p = await prisma.periode.findUniqueOrThrow({ where: { id: periodeId } });
  expect(p.status).toBe("DIKUNCI");
  expect(p.dikunciOlehId).toBe(pimId);
  expect(p.dikunciAt).not.toBeNull();
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { aksi: "KUNCI_PERIODE", entitasId: periodeId } });
  expect(audit.userId).toBe(pimId);
  expect(audit.metadata).toMatchObject({ sebelum: { status: "DRAFT" }, sesudah: { status: "DIKUNCI" } });

  // Rekap final diproses worker dan memuat data akhir.
  for (let i = 0; i < 100; i++) {
    const sisa = await prisma.rekapSKP.count({ where: { periodeId, status: { in: ["QUEUED", "PROSES"] } } });
    if (sisa === 0) break;
    await new Promise((res) => setTimeout(res, 300));
  }
  const rekap = await prisma.rekapSKP.findMany({ where: { periodeId } });
  expect(rekap).toHaveLength(3);
  expect(rekap.every((x) => x.isFinal && x.status === "SELESAI" && x.filePdfKey)).toBe(true);
  const yul = rekap.find((x) => x.userId === I.yul)!;
  const j = yul.ringkasanJson as unknown as { alokasi: { realisasi: number; menunggu: number }[]; entri: { disetujui: number; menunggu: number; mintaRevisi: number } };
  expect(j.alokasi[0]).toMatchObject({ realisasi: 8, menunggu: 5 });
  expect(j.entri).toMatchObject({ disetujui: 1, menunggu: 1, mintaRevisi: 1 });
  expect(await prisma.auditLog.count({ where: { aksi: "GENERATE_REKAP_FINAL", entitasId: periodeId } })).toBe(1);

  // Mengunci dua kali ditolak (oleh peran mana pun yang berwenang).
  const lagi = await pim.request.post(`/api/periode/${periodeId}/kunci`);
  expect(lagi.status()).toBe(409);
  expect((await lagi.json()).pesan).toContain("sudah dikunci");
  const admin = await sebagai(browser, USERS.admin.nip);
  expect((await admin.request.post(`/api/periode/${periodeId}/kunci`)).status()).toBe(409);
  await admin.tutup();
  await pim.tutup();
});

test("setelah dikunci: SEMUA POST/PATCH/DELETE entri, bukti, alokasi, keanggotaan, dan verifikasi ditolak 409 di server", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const admin = await sebagai(browser, USERS.admin.nip);
  const pdf = { name: "x.pdf", mimeType: "application/pdf", buffer: Buffer.concat([contohPdf(), Buffer.from("unik")]) };

  const kasus: [string, Awaited<ReturnType<typeof sc>>][] = [
    // Entri
    ["POST entri baru", await sc(await yul.request.post("/api/pekerjaan-harian", { data: { penugasanId: I.penYul, tanggal: "2026-07-17", deskripsiCapaian: "x", volume: 1 } }))],
    ["POST entri tugas tambahan", await sc(await yul.request.post("/api/pekerjaan-harian", { data: { isAdHoc: true, judulAdHoc: "x", tanggal: "2026-07-17", deskripsiCapaian: "x", satuan: "k" } }))],
    ["PATCH entri", await sc(await yul.request.patch(`/api/pekerjaan-harian/${I.menunggu}`, { data: { volume: 9 } }))],
    ["DELETE entri", await sc(await yul.request.delete(`/api/pekerjaan-harian/${I.menunggu}`))],
    ["PATCH entri revisi", await sc(await yul.request.patch(`/api/pekerjaan-harian/${I.revisi}`, { data: { deskripsiCapaian: "perbaikan" } }))],
    // Bukti
    ["POST bukti", await sc(await yul.request.post(`/api/pekerjaan-harian/${I.menunggu}/bukti`, { multipart: { file: pdf } }))],
    ["PUT bukti (ganti)", await sc(await yul.request.put(`/api/bukti/${I.bukti}`, { multipart: { file: pdf } }))],
    ["DELETE bukti", await sc(await yul.request.delete(`/api/bukti/${I.bukti}`))],
    // Alokasi
    ["POST alokasi", await sc(await ketua.request.post("/api/alokasi", { data: { timId, periodeId, judul: "Baru", deskripsi: "d", tanggalMulai: "2026-07-01", tanggalSelesai: "2026-07-10", targetVolume: 5, satuan: "dok", prioritas: "SEDANG", penugasan: [{ userId: I.yul }] } }))],
    ["PATCH alokasi", await sc(await ketua.request.patch(`/api/alokasi/${I.alokasi}`, { data: { judul: "Ubah" } }))],
    ["POST batalkan alokasi", await sc(await ketua.request.post(`/api/alokasi/${I.alokasi}/batalkan`, { data: { alasan: "alasan uji" } }))],
    ["DELETE alokasi", await sc(await ketua.request.delete(`/api/alokasi/${I.alokasi}`))],
    ["POST salin ke periode terkunci", await sc(await ketua.request.post("/api/alokasi/salin", { data: { timId, periodeTujuanId: periodeId } }))],
    // Verifikasi
    ["POST verifikasi", await sc(await ketua.request.post(`/api/pekerjaan-harian/${I.menunggu}/verifikasi`, { data: { aksi: "SETUJUI" } }))],
    ["POST verifikasi bulk", await sc(await ketua.request.post("/api/verifikasi/bulk", { data: { ids: [I.menunggu, I.rina1] } }))],
    // Keanggotaan & status periode
    ["POST anggota tim", await sc(await admin.request.post(`/api/tim/${timId}/anggota`, { data: { periodeId, hapus: [I.rina] } }))],
    ["POST aktifkan periode", await sc(await admin.request.post(`/api/periode/${periodeId}/aktifkan`))],
  ];
  for (const [nama, hasil] of kasus) {
    expect(hasil.status, `${nama} → ${hasil.pesan}`).toBe(409);
    expect(hasil.pesan, nama).toMatch(/dikunci|tidak dapat diaktifkan/i);
  }

  // Tidak ada yang berubah di basis data.
  const e = await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: I.menunggu } });
  expect(Number(e.volume)).toBe(5);
  expect(e.statusVerifikasi).toBe("MENUNGGU");
  expect(await prisma.pekerjaanHarian.count({ where: { periodeId } })).toBe(4);
  expect(await prisma.buktiDukung.count({ where: { id: I.bukti } })).toBe(1);
  expect((await prisma.alokasi.findUniqueOrThrow({ where: { id: I.alokasi } })).judul).toBe("Alokasi Juli");
  expect(await prisma.anggotaTim.count({ where: { periodeId } })).toBe(3);

  // Data tetap dapat dibaca.
  expect((await yul.request.get(`/api/pekerjaan-harian?periodeId=${periodeId}`)).status()).toBe(200);
  expect((await ketua.request.get(`/api/alokasi?periodeId=${periodeId}`)).status()).toBe(200);
  for (const x of [yul, ketua, admin]) await x.tutup();
});

test.describe("UI (360px)", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test("periode dikunci: tombol tambah/ubah/hapus dinonaktifkan atau disembunyikan", async ({ browser }) => {
    const ketua = await sebagai(browser, USERS.ketua.nip);
    const page = ketua.page;
    await page.goto("/alokasi", { waitUntil: "networkidle" });
    await page.getByLabel("Periode").selectOption({ label: "Juli 2026 (DIKUNCI)" });
    await expect(page.getByRole("heading", { name: "Alokasi Juli" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Tambah alokasi" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Salin dari bulan lalu" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Batalkan" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hapus" })).toHaveCount(0);
    await ketua.tutup();

    const yul = await sebagai(browser, USERS.yul.nip);
    // Kalender Juli: detail hari 15 Juli menunjukkan catatan hanya-baca.
    await yul.page.goto("/kalender", { waitUntil: "networkidle" });
    for (const bulan of ["September 2026", "Agustus 2026", "Juli 2026"]) {
      await yul.page.getByLabel("Bulan sebelumnya").click();
      await expect(yul.page.getByText(bulan, { exact: true })).toBeVisible();
    }
    await yul.page.locator('[data-tanggal="2026-07-14"]').click();
    const kartu = yul.page.getByRole("listitem").filter({ hasText: "KUNCI menunggu" });
    await expect(kartu.getByText("Periode dikunci — catatan hanya dapat dibaca.")).toBeVisible();
    await expect(kartu.getByRole("button", { name: "Ubah" })).toHaveCount(0);
    await expect(yul.page.getByRole("button", { name: "+ Catat untuk tanggal ini" })).toHaveCount(0);

    // Halaman Revisi: entri yang perlu revisi di periode terkunci tidak bisa diperbaiki.
    await yul.page.goto("/revisi", { waitUntil: "networkidle" });
    const rev = yul.page.getByRole("listitem").filter({ hasText: "KUNCI revisi" });
    await expect(rev.getByText("Periode dikunci — catatan tidak dapat diperbaiki lagi.")).toBeVisible();
    await expect(rev.getByRole("button", { name: "Perbaiki" })).toHaveCount(0);
    await yul.tutup();

    // Admin: tombol Kunci tidak ada untuk periode yang sudah dikunci, ada untuk yang belum.
    const admin = await sebagai(browser, USERS.admin.nip);
    await admin.page.goto("/admin/periode", { waitUntil: "networkidle" });
    await expect(admin.page.getByRole("button", { name: "Kunci Juli 2026" })).toHaveCount(0);
    await expect(admin.page.getByRole("button", { name: "Kunci Oktober 2026" })).toBeVisible();
    // Halaman Rekap menandai rekap final.
    await admin.page.goto("/rekap", { waitUntil: "networkidle" });
    await admin.page.getByLabel("Periode").selectOption({ label: "Juli 2026 (DIKUNCI)" });
    await expect(admin.page.locator(`[data-pegawai="${I.yul}"]`).getByText("Final")).toBeVisible();
    await expect(admin.page.getByRole("button", { name: /Kunci periode/ })).toHaveCount(0);
    await admin.tutup();
  });
});
