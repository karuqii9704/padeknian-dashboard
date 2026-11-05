import { expect, test, type APIRequestContext } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { USERS } from "./support/data";
import { anggotaTim, buatAlokasi, catat, periodeAktif, sebagai, timMilik } from "./support/api";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

type Notif = { id: string; tipe: string; judul: string; isi: string; link: string | null; isRead: boolean; createdAt: string };
const ambil = async (request: APIRequestContext, qs = "") => (await (await request.get(`/api/notifikasi?pageSize=100${qs}`)).json()) as { data: Notif[]; total: number; belumDibaca: number };
const verif = (request: APIRequestContext, id: string, data: object) => request.post(`/api/pekerjaan-harian/${id}/verifikasi`, { data });

const E: Record<string, string> = {};
let periodeId = "";
let yulId = "";

test("alokasi baru: tiap penerima (selain pembuat) mendapat notifikasi ALOKASI_BARU", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  periodeId = (await periodeAktif(ketua.request)).id;
  const tim = await timMilik(ketua.request);
  const u = await anggotaTim(ketua.request, tim.id, periodeId);
  yulId = u(USERS.yul.nama);
  const al = await buatAlokasi(ketua.request, { timId: tim.id, periodeId, judul: "Alokasi uji notifikasi", userIds: [yulId, u(USERS.ketua.nama)], target: 200 });
  const pen = al.penugasan.find((p) => p.userId === yulId)!.id;

  const ketuaNotif = await ambil(ketua.request);
  expect(ketuaNotif.data.some((n) => n.isi.includes("Alokasi uji notifikasi")), "pembuat tidak dinotifikasi").toBe(false);

  const yul = await sebagai(browser, USERS.yul.nip);
  const n = (await ambil(yul.request)).data.find((x) => x.isi.includes("Alokasi uji notifikasi"))!;
  expect(n).toMatchObject({ tipe: "ALOKASI_BARU", judul: "Alokasi baru", isRead: false, link: "/hari-ini" });
  expect(n.isi).toContain("target 200 dokumen");

  for (const k of ["a", "b", "c", "d", "e", "f"]) E[k] = await catat(yul.request, pen, `NOTIF entri ${k}`, 2);
  await yul.tutup();
  await ketua.tutup();
});

test("verifikasi (setuju/revisi/tolak) membuat notifikasi seketika dengan catatan verifikator", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const yul = await sebagai(browser, USERS.yul.nip);
  const sebelum = (await ambil(yul.request)).total;
  const mulai = Date.now();

  expect((await verif(ketua.request, E.a, { aksi: "SETUJUI", catatan: "Sudah lengkap, terima kasih." })).status()).toBe(200);
  expect((await verif(ketua.request, E.b, { aksi: "MINTA_REVISI", catatan: "Volume belum sesuai bukti." })).status()).toBe(200);
  expect((await verif(ketua.request, E.c, { aksi: "TOLAK", catatan: "Bukan bagian dari alokasi ini." })).status()).toBe(200);

  const sesudah = await ambil(yul.request);
  expect(sesudah.total - sebelum).toBe(3);
  const baru = sesudah.data.slice(0, 3); // terbaru dulu
  const by = (frag: string) => baru.find((n) => n.isi.includes(frag))!;

  const setuju = by("disetujui");
  expect(setuju).toMatchObject({ tipe: "VERIFIKASI", judul: "Catatan disetujui", link: "/kalender?tanggal=2026-10-14" });
  expect(setuju.isi).toContain(`oleh ${USERS.ketua.nama}`);
  expect(setuju.isi).toContain("Sudah lengkap, terima kasih.");

  const revisi = by("diminta revisi");
  expect(revisi).toMatchObject({ tipe: "REVISI", judul: "Catatan perlu direvisi", link: "/revisi" });
  expect(revisi.isi).toContain("Volume belum sesuai bukti.");

  const tolak = by("ditolak");
  expect(tolak).toMatchObject({ tipe: "REVISI", judul: "Catatan ditolak" });
  expect(tolak.isi).toContain("Bukan bagian dari alokasi ini.");

  for (const n of baru) expect(new Date(n.createdAt).getTime() - mulai, "dibuat dalam hitungan detik").toBeLessThan(60_000);
  expect(sesudah.belumDibaca).toBeGreaterThanOrEqual(4);
  await yul.tutup();
  await ketua.tutup();
});

test("bulk approve menghasilkan satu notifikasi per catatan", async ({ browser }) => {
  const ketua = await sebagai(browser, USERS.ketua.nip);
  const yul = await sebagai(browser, USERS.yul.nip);
  const sebelum = (await ambil(yul.request)).total;
  const r = await ketua.request.post("/api/verifikasi/bulk", { data: { ids: [E.d, E.e, E.f] } });
  expect(r.status()).toBe(200);
  expect((await ambil(yul.request)).total - sebelum).toBe(3);
  await yul.tutup();
  await ketua.tutup();
});

test("notifikasi bersifat pribadi; tandai dibaca hanya oleh pemilik; baca-semua", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const rina = await sebagai(browser, USERS.rina.nip);

  const daftar = await ambil(yul.request);
  const target = daftar.data.find((n) => !n.isRead)!;
  const rinaIds = new Set((await ambil(rina.request)).data.map((n) => n.id));
  expect(rinaIds.has(target.id), "Rina tidak melihat notifikasi Yul").toBe(false);

  // Bukan pemilik -> 404 dan tidak berubah.
  expect((await rina.request.post(`/api/notifikasi/${target.id}/baca`)).status()).toBe(404);
  expect((await prisma.notifikasi.findUniqueOrThrow({ where: { id: target.id } })).isRead).toBe(false);

  // Pemilik -> 200, hitungan belum dibaca turun 1; idempoten.
  const belum0 = daftar.belumDibaca;
  expect((await yul.request.post(`/api/notifikasi/${target.id}/baca`)).status()).toBe(200);
  expect((await yul.request.post(`/api/notifikasi/${target.id}/baca`)).status()).toBe(200);
  expect((await ambil(yul.request)).belumDibaca).toBe(belum0 - 1);

  // Filter belum dibaca & paginasi.
  const belum = await ambil(yul.request, "&belumDibaca=true");
  expect(belum.data.every((n) => !n.isRead)).toBe(true);
  expect(belum.total).toBe(belum0 - 1);
  const hal = await (await yul.request.get("/api/notifikasi?pageSize=2&page=2")).json();
  expect(hal.data.length).toBeLessThanOrEqual(2);
  expect(hal.page).toBe(2);

  // ID tidak valid / tanpa sesi.
  expect((await yul.request.post("/api/notifikasi/bukan-uuid/baca")).status()).toBe(404);
  const semua = await yul.request.post("/api/notifikasi/baca-semua");
  expect((await semua.json()).jumlah).toBe(belum0 - 1);
  expect((await ambil(yul.request)).belumDibaca).toBe(0);
  await yul.tutup();
  await rina.tutup();
});

test("pimpinan melihat status verifikasi agregat per pegawai (hanya baca); tidak bisa memverifikasi", async ({ browser, request }) => {
  const pim = await sebagai(browser, USERS.pimpinan.nip);
  const res = await pim.request.get("/api/verifikasi/ringkasan");
  expect(res.status()).toBe(200);
  const body = await res.json();
  const yul = (body.data as { userId: string; total: number; menunggu: number; disetujui: number; mintaRevisi: number; ditolak: number; verifikasiTerakhir: string | null; tim: string[] }[]).find((x) => x.userId === yulId)!;

  // Cocok dengan hitungan langsung ke tabel.
  const g = await prisma.pekerjaanHarian.groupBy({ by: ["statusVerifikasi"], where: { userId: yulId, periodeId }, _count: { _all: true } });
  const c = (s: string) => g.find((x) => x.statusVerifikasi === s)?._count._all ?? 0;
  expect(yul).toMatchObject({ menunggu: c("MENUNGGU"), disetujui: c("DISETUJUI"), mintaRevisi: c("MINTA_REVISI"), ditolak: c("DITOLAK") });
  expect(yul.total).toBe(c("MENUNGGU") + c("DISETUJUI") + c("MINTA_REVISI") + c("DITOLAK"));
  expect(yul.verifikasiTerakhir).not.toBeNull();
  expect(yul.tim).toContain("Tim Statistik Produksi");

  // Filter tim: hanya anggota tim itu.
  const tims = (await (await pim.request.get("/api/tim")).json()).data as { id: string; nama: string }[];
  const timB = tims.find((t) => t.nama === "Tim Umum")!;
  const onlyB = await (await pim.request.get(`/api/verifikasi/ringkasan?timId=${timB.id}`)).json();
  expect((onlyB.data as { nama: string }[]).map((x) => x.nama).sort()).toEqual([USERS.ketua2.nama, USERS.sari.nama].sort());

  // Hanya baca: aksi verifikasi oleh pimpinan → 403 dan tidak mengubah apa pun.
  const entri = await prisma.pekerjaanHarian.create({
    data: { periodeId, penugasanId: (await prisma.penugasanAlokasi.findFirstOrThrow({ where: { userId: yulId } })).id, userId: yulId, tanggal: new Date("2026-10-14T00:00:00Z"), deskripsiCapaian: "NOTIF pimpinan uji", volume: 1, satuan: "dokumen" },
  });
  expect((await verif(pim.request, entri.id, { aksi: "SETUJUI" })).status()).toBe(403);
  expect((await prisma.pekerjaanHarian.findUniqueOrThrow({ where: { id: entri.id } })).statusVerifikasi).toBe("MENUNGGU");
  expect((await pim.request.post("/api/verifikasi/bulk", { data: { ids: [entri.id] } })).status()).toBe(403);
  await pim.tutup();

  // Peran lain tidak boleh mengakses ringkasan.
  for (const nip of [USERS.yul.nip, USERS.ketua.nip]) {
    const u = await sebagai(browser, nip);
    expect((await u.request.get("/api/verifikasi/ringkasan")).status(), nip).toBe(403);
    await u.tutup();
  }
  expect((await request.get("/api/notifikasi")).status()).toBe(401);
});
