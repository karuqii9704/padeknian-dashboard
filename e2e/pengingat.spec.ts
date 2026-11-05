import { expect, test } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { periodeAktif, sebagai } from "./support/api";
import { E2E_PASSWORD, FAKE_TODAY, TIM_NAMA, USERS } from "./support/data";

// Pengingat harian: FAKE_TODAY Rabu 14 Okt 2026 -> sasaran hari kerja sebelumnya Selasa 13 Okt.
const SASARAN = "2026-10-13";
const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());

test("pengingat dikirim ke yang belum mengisi hari kerja sebelumnya, idempoten, dan hanya Admin/token", async ({ browser, request }) => {
  expect(FAKE_TODAY).toBe("2026-10-14");
  const admin = await sebagai(browser, USERS.admin.nip);
  const periode = await periodeAktif(admin.request);
  const tim = ((await (await admin.request.get("/api/tim")).json()).data as { id: string; nama: string }[]).find((t) => t.nama === TIM_NAMA)!;

  const buat = async (akhir: string) => {
    const nip = `19970${Date.now()}`.slice(0, 17) + akhir;
    const r = await admin.request.post("/api/pengguna", { data: { nip, nama: `Uji Pengingat ${akhir}`, role: "PEGAWAI", password: E2E_PASSWORD } });
    expect(r.status(), await r.text()).toBe(201);
    const id = (await r.json()).user.id as string;
    await prisma.user.update({ where: { id }, data: { mustChangePassword: false } }); // akun uji, lewati ganti password
    return { nip, id };
  };
  const lupa = await buat("1");
  const rajin = await buat("2");
  expect((await admin.request.post(`/api/tim/${tim.id}/anggota`, { data: { periodeId: periode.id, tambah: [lupa.id, rajin.id] } })).status()).toBe(200);

  // "rajin" mencatat tugas tambahan pada tanggal sasaran.
  const r = await sebagai(browser, rajin.nip);
  const e = await r.request.post("/api/pekerjaan-harian", {
    data: { isAdHoc: true, judulAdHoc: "Rapat koordinasi", satuan: "kegiatan", tanggal: SASARAN, deskripsiCapaian: "Ikut rapat", volume: 1 },
  });
  expect(e.status(), await e.text()).toBe(201);

  // Pegawai biasa tidak boleh memicu; tanpa sesi/token juga tidak.
  expect((await r.request.post("/api/pengingat")).status()).toBe(403);
  expect((await request.post("/api/pengingat")).status()).toBe(401);
  expect((await request.post("/api/pengingat", { headers: { authorization: "Bearer salah-salah-salah-salah" } })).status()).toBe(401);

  const kirim = await admin.request.post("/api/pengingat");
  expect(kirim.status()).toBe(200);
  const hasil = await kirim.json();
  expect(hasil).toMatchObject({ dikirim: true, tanggal: SASARAN });

  const notifDari = async (ctx: typeof r.request) =>
    ((await (await ctx.get("/api/notifikasi")).json()).data as { tipe: string; link: string; isi: string }[]).filter((n) => n.tipe === "PENGINGAT_HARIAN");
  const l = await sebagai(browser, lupa.nip);
  const notifLupa = await notifDari(l.request);
  expect(notifLupa).toHaveLength(1);
  expect(notifLupa[0].link).toBe(`/hari-ini?catat=1&tanggal=${SASARAN}`);
  expect(notifLupa[0].isi).toContain("13 Okt 2026");
  expect(await notifDari(r.request)).toHaveLength(0);

  // Dipicu ulang: tidak ada notifikasi ganda.
  const ulang = await (await admin.request.post("/api/pengingat")).json();
  expect(ulang.jumlah).toBe(0);
  expect(ulang.sudahAda).toBeGreaterThan(0);
  expect(await notifDari(l.request)).toHaveLength(1);

  // Tautan pengingat membuka form catat dengan tanggal sasaran terpilih.
  await l.page.goto(`/hari-ini?catat=1&tanggal=${SASARAN}`);
  await expect(l.page.getByRole("dialog", { name: "Form pekerjaan harian" }).getByRole("combobox", { name: "Tanggal" })).toHaveValue(SASARAN);

  // Token cron (bila CRON_SECRET diatur untuk server uji).
  if (process.env.CRON_SECRET) {
    const t = await request.post("/api/pengingat", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(t.status()).toBe(200);
  }

  for (const u of [lupa, rajin]) await admin.request.patch(`/api/pengguna/${u.id}`, { data: { isActive: false } });
  await Promise.all([admin.tutup(), r.tutup(), l.tutup()]);
});
