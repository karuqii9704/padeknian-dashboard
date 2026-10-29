import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { USERS } from "./support/data";
import { sebagai } from "./support/api";

// Hari ini (E2E) = Rabu 2026-10-14. Periode: Oktober AKTIF, September DRAFT, Agustus DIKUNCI.
const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());
test.describe.configure({ mode: "serial" });

const badan = (o: Record<string, unknown> = {}) => ({
  judul: "Rapat koordinasi Susenas",
  jenis: "RAPAT",
  tanggalMulai: "2026-10-13",
  tanggalSelesai: "2026-10-13",
  lokasi: "Ruang rapat BPS Kerinci",
  peran: "Peserta",
  uraianHasil: "Disepakati jadwal pencacahan.",
  ...o,
});

type EventJson = { id: string; periodeId: string; periodeDikunci: boolean; judul: string; pelapor: { nama: string }; lampiran: unknown[] };
const ids = (r: { data: EventJson[] }) => r.data.map((e) => e.id);

let eventTari = "";
let eventKetua = "";
let eventDewiSept = "";
let eventDewiOkt = "";

test("tanpa sesi 401; pimpinan dan admin 403", async ({ browser, request }) => {
  expect((await request.get("/api/event")).status()).toBe(401);
  expect((await request.post("/api/event", { data: badan() })).status()).toBe(401);
  for (const nip of [USERS.pimpinan.nip, USERS.admin.nip]) {
    const u = await sebagai(browser, nip);
    expect((await u.request.get("/api/event")).status()).toBe(403);
    expect((await u.request.post("/api/event", { data: badan() })).status()).toBe(403);
    await u.tutup();
  }
});

test("validasi: pesan Indonesia untuk tanggal, isian wajib, masa depan, di luar periode, periode dikunci", async ({ browser }) => {
  const tari = await sebagai(browser, USERS.tari.nip);
  const kirim = async (o: Record<string, unknown>) => {
    const r = await tari.request.post("/api/event", { data: badan(o) });
    return { status: r.status(), pesan: ((await r.json()).pesan ?? "") as string };
  };

  const urutan = await kirim({ tanggalMulai: "2026-10-13", tanggalSelesai: "2026-10-12" });
  expect(urutan).toMatchObject({ status: 400 });
  expect(urutan.pesan).toContain("Tanggal selesai tidak boleh sebelum tanggal mulai");

  expect((await kirim({ judul: "  " })).status).toBe(400);
  expect((await kirim({ jenis: "PESTA" })).pesan).toContain("Jenis event tidak valid");
  expect((await kirim({ uraianHasil: "" })).pesan).toContain("Uraian hasil wajib diisi");
  // Regresi: format tanggal salah harus 400, bukan 500.
  expect((await kirim({ tanggalMulai: "14-10-2026", tanggalSelesai: "14-10-2026" })).status).toBe(400);

  const depan = await kirim({ tanggalMulai: "2026-10-15", tanggalSelesai: "2026-10-15" });
  expect(depan.status).toBe(400);
  expect(depan.pesan).toContain("masa depan");

  const luar = await kirim({ tanggalMulai: "2026-01-10", tanggalSelesai: "2026-01-10" });
  expect(luar.status).toBe(400);
  expect(luar.pesan).toContain("tidak berada dalam periode");

  const dikunci = await kirim({ tanggalMulai: "2026-08-12", tanggalSelesai: "2026-08-12" });
  expect(dikunci.status).toBe(409);
  expect(dikunci.pesan).toContain("dikunci");
  await tari.tutup();
});

test("pegawai membuat event; ketua tim dan ketua lain: akses sesuai tim", async ({ browser }) => {
  const tari = await sebagai(browser, USERS.tari.nip);
  const r = await tari.request.post("/api/event", { data: badan({ judul: "Rapat Tari", tanggalSelesai: "2026-10-14" }) });
  expect(r.status()).toBe(201);
  const e = (await r.json()).event as EventJson & { jenis: string; tanggalMulai: string; tanggalSelesai: string };
  eventTari = e.id;
  expect(e).toMatchObject({ judul: "Rapat Tari", jenis: "RAPAT", tanggalMulai: "2026-10-13", tanggalSelesai: "2026-10-14", periodeDikunci: false, lampiran: [] });
  expect(e.pelapor.nama).toBe(USERS.tari.nama);
  expect(JSON.stringify(e)).not.toContain("objectKey");

  // Pemilik membaca; daftar "saya" memuatnya.
  expect((await tari.request.get(`/api/event/${eventTari}`)).status()).toBe(200);
  expect(ids(await (await tari.request.get("/api/event")).json())).toContain(eventTari);
  // Pegawai tidak boleh meminta cakupan tim atau milik orang lain.
  expect((await tari.request.get("/api/event?cakupan=tim")).status()).toBe(403);
  expect((await tari.request.get(`/api/event?userId=${(await prisma.user.findUniqueOrThrow({ where: { nip: USERS.rina.nip } })).id}`)).status()).toBe(403);
  await tari.tutup();

  // Pegawai lain: tidak tahu event itu ada (404), tidak boleh mengubah (403).
  const rina = await sebagai(browser, USERS.rina.nip);
  expect((await rina.request.get(`/api/event/${eventTari}`)).status()).toBe(404);
  expect((await rina.request.patch(`/api/event/${eventTari}`, { data: { lokasi: "x" } })).status()).toBe(403);
  expect((await rina.request.delete(`/api/event/${eventTari}`)).status()).toBe(403);
  expect(ids(await (await rina.request.get("/api/event")).json())).not.toContain(eventTari);
  await rina.tutup();

  // Ketua tim pemilik: boleh melihat, tidak boleh mengubah atau menghapus.
  const ketua = await sebagai(browser, USERS.ketua.nip);
  expect((await ketua.request.get(`/api/event/${eventTari}`)).status()).toBe(200);
  expect((await ketua.request.patch(`/api/event/${eventTari}`, { data: { lokasi: "x" } })).status()).toBe(403);
  expect((await ketua.request.delete(`/api/event/${eventTari}`)).status()).toBe(403);
  expect(ids(await (await ketua.request.get("/api/event?cakupan=tim")).json())).toContain(eventTari);
  expect(ids(await (await ketua.request.get("/api/event?cakupan=saya")).json())).not.toContain(eventTari);

  // Event milik ketua sendiri: muncul di "saya", tidak di "tim".
  const rk = await ketua.request.post("/api/event", { data: badan({ judul: "Rapat Ketua" }) });
  expect(rk.status()).toBe(201);
  eventKetua = (await rk.json()).event.id;
  expect(ids(await (await ketua.request.get("/api/event?cakupan=saya")).json())).toContain(eventKetua);
  expect(ids(await (await ketua.request.get("/api/event?cakupan=tim")).json())).not.toContain(eventKetua);
  await ketua.tutup();

  // Ketua tim lain: tidak melihat.
  const ketua2 = await sebagai(browser, USERS.ketua2.nip);
  expect((await ketua2.request.get(`/api/event/${eventTari}`)).status()).toBe(404);
  expect(ids(await (await ketua2.request.get("/api/event?cakupan=tim")).json())).not.toContain(eventTari);
  await ketua2.tutup();
});

test("cakupan tim mengikuti keanggotaan per periode (Dewi: anggota September, bukan Oktober)", async ({ browser }) => {
  const dewi = await sebagai(browser, USERS.dewi.nip);
  const sept = await dewi.request.post("/api/event", { data: badan({ judul: "Pelatihan Dewi September", jenis: "PELATIHAN", tanggalMulai: "2026-09-10", tanggalSelesai: "2026-09-11" }) });
  expect(sept.status()).toBe(201);
  eventDewiSept = (await sept.json()).event.id;
  const okt = await dewi.request.post("/api/event", { data: badan({ judul: "Rapat Dewi Oktober" }) });
  expect(okt.status()).toBe(201);
  eventDewiOkt = (await okt.json()).event.id;
  await dewi.tutup();

  const ketua = await sebagai(browser, USERS.ketua.nip);
  const tim = ids(await (await ketua.request.get("/api/event?cakupan=tim&pageSize=100")).json());
  expect(tim).toContain(eventDewiSept);
  expect(tim).not.toContain(eventDewiOkt);
  expect((await ketua.request.get(`/api/event/${eventDewiSept}`)).status()).toBe(200);
  expect((await ketua.request.get(`/api/event/${eventDewiOkt}`)).status()).toBe(404);

  // Filter jenis dan pegawai.
  const pel = ids(await (await ketua.request.get("/api/event?cakupan=tim&jenis=PELATIHAN&pageSize=100")).json());
  expect(pel).toContain(eventDewiSept);
  expect(pel).not.toContain(eventTari);
  const dewiId = (await prisma.user.findUniqueOrThrow({ where: { nip: USERS.dewi.nip } })).id;
  const perDewi = ids(await (await ketua.request.get(`/api/event?cakupan=tim&userId=${dewiId}&pageSize=100`)).json());
  expect(perDewi).toEqual([eventDewiSept]);
  await ketua.tutup();
});

test("pemilik mengubah event; validasi ubah; pindah tanggal memindahkan periode", async ({ browser }) => {
  const tari = await sebagai(browser, USERS.tari.nip);
  const ok = await tari.request.patch(`/api/event/${eventTari}`, { data: { lokasi: "Aula BPS", peran: "Narasumber" } });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).event).toMatchObject({ lokasi: "Aula BPS", peran: "Narasumber", judul: "Rapat Tari" });

  expect((await tari.request.patch(`/api/event/${eventTari}`, { data: {} })).status()).toBe(400);
  const urutan = await tari.request.patch(`/api/event/${eventTari}`, { data: { tanggalSelesai: "2026-10-01" } });
  expect(urutan.status()).toBe(400);
  expect((await urutan.json()).pesan).toContain("Tanggal selesai tidak boleh sebelum tanggal mulai");
  expect((await tari.request.patch(`/api/event/${eventTari}`, { data: { tanggalMulai: "2026-10-20", tanggalSelesai: "2026-10-20" } })).status()).toBe(400); // masa depan
  expect((await tari.request.patch(`/api/event/${eventTari}`, { data: { tanggalMulai: "2026-08-12", tanggalSelesai: "2026-08-12" } })).status()).toBe(409); // periode dikunci

  const awal = (await (await tari.request.get(`/api/event/${eventTari}`)).json()).event.periodeId as string;
  const pindah = await tari.request.patch(`/api/event/${eventTari}`, { data: { tanggalMulai: "2026-09-15", tanggalSelesai: "2026-09-15" } });
  expect(pindah.status()).toBe(200);
  expect((await pindah.json()).event.periodeId).not.toBe(awal);
  const kembali = await tari.request.patch(`/api/event/${eventTari}`, { data: { tanggalMulai: "2026-10-13", tanggalSelesai: "2026-10-14" } });
  expect((await kembali.json()).event.periodeId).toBe(awal);
  await tari.tutup();
});

test("periode DIKUNCI: ubah dan hapus 409, tetap bisa dibaca; dipulihkan setelahnya", async ({ browser }) => {
  const yul = await sebagai(browser, USERS.yul.nip);
  const r = await yul.request.post("/api/event", { data: badan({ judul: "Survei Yul", jenis: "SURVEI_LAPANGAN", tanggalMulai: "2026-09-15", tanggalSelesai: "2026-09-15" }) });
  expect(r.status()).toBe(201);
  const id = (await r.json()).event.id as string;
  const e = await prisma.event.findUniqueOrThrow({ where: { id } });

  await prisma.periode.update({ where: { id: e.periodeId }, data: { status: "DIKUNCI" } });
  try {
    expect((await yul.request.patch(`/api/event/${id}`, { data: { lokasi: "x" } })).status()).toBe(409);
    expect((await yul.request.delete(`/api/event/${id}`)).status()).toBe(409);
    const baca = await yul.request.get(`/api/event/${id}`);
    expect(baca.status()).toBe(200);
    expect((await baca.json()).event.periodeDikunci).toBe(true);
  } finally {
    await prisma.periode.update({ where: { id: e.periodeId }, data: { status: "DRAFT" } });
  }
  // Setelah dibuka lagi, pemilik dapat menghapus.
  expect((await yul.request.delete(`/api/event/${id}`)).status()).toBe(200);
  await yul.tutup();
});

test("pemilik menghapus event; audit tercatat; event hilang", async ({ browser }) => {
  const tari = await sebagai(browser, USERS.tari.nip);
  expect((await tari.request.delete(`/api/event/${eventTari}`)).status()).toBe(200);
  expect((await tari.request.get(`/api/event/${eventTari}`)).status()).toBe(404);
  expect((await tari.request.delete(`/api/event/${eventTari}`)).status()).toBe(404);
  await tari.tutup();
  expect(await prisma.auditLog.count({ where: { aksi: "HAPUS_EVENT", entitasId: eventTari } })).toBe(1);
  expect(await prisma.event.count({ where: { id: eventTari } })).toBe(0);
});
