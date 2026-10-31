import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression test untuk bug "ketua tim bisa menambahkan namanya sendiri".
 *
 * Aturan bisnis: ketua tim memimpin lewat `TimKerja.ketuaId` dan TIDAK pernah disimpan sebagai
 * baris `AnggotaTim`. Menambahkan/menghapus ketua lewat endpoint anggota harus ditolak di server,
 * bukan hanya disembunyikan di UI.
 */

const periodeAktif = { id: "periode-1", tahun: 2026, bulan: 10, status: "AKTIF" as const };
const tim = { id: "tim-1", ketuaId: "user-ketua" };

const mocks = vi.hoisted(() => ({
  periodeFindUnique: vi.fn(),
  userFindMany: vi.fn(),
  anggotaCreateMany: vi.fn(),
  anggotaDeleteMany: vi.fn(),
  transaction: vi.fn(),
  tulisAudit: vi.fn(),
  timFindUnique: vi.fn(),
  anggotaFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    periode: { findUnique: mocks.periodeFindUnique },
    user: { findMany: mocks.userFindMany },
    anggotaTim: {
      createMany: mocks.anggotaCreateMany,
      deleteMany: mocks.anggotaDeleteMany,
      findMany: mocks.anggotaFindMany,
    },
    timKerja: { findUnique: mocks.timFindUnique },
    $transaction: mocks.transaction,
  },
}));

// lib/rbac -> @/auth -> next-auth (butuh next/server, tidak kompatibel dengan environment test node).
vi.mock("@/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/audit", () => ({ tulisAudit: mocks.tulisAudit }));

import { ubahAnggota, ubahAnggotaSchema, daftarAnggotaDenganKetua } from "./tim";

const UUID = "11111111-1111-4111-8111-111111111111";
const periodeId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.periodeFindUnique.mockResolvedValue(periodeAktif);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.anggotaCreateMany.mockResolvedValue({ count: 0 });
  mocks.anggotaDeleteMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  mocks.tulisAudit.mockResolvedValue(undefined);
});

describe("ubahAnggota — protections against the leader adding themselves", () => {
  it("menolak menambahkan ketua tim sebagai anggota", async () => {
    const input = ubahAnggotaSchema.parse({ periodeId, tambah: [UUID] });
    const r = await ubahAnggota("admin-1", { ...tim, ketuaId: UUID }, input, null);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.pesan).toMatch(/Ketua tim/i);
    }
    // Tidak boleh menyentuh database sama sekali
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.anggotaCreateMany).not.toHaveBeenCalled();
  });

  it("menolak menghapus ketua tim dari keanggotaan", async () => {
    const input = ubahAnggotaSchema.parse({ periodeId, hapus: [UUID] });
    const r = await ubahAnggota("admin-1", { ...tim, ketuaId: UUID }, input, null);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pesan).toMatch(/tidak dapat dihapus/i);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("menolak perubahan pada periode yang sudah dikunci", async () => {
    mocks.periodeFindUnique.mockResolvedValue({ ...periodeAktif, status: "DIKUNCI" });
    const input = ubahAnggotaSchema.parse({ periodeId, tambah: [UUID] });
    const r = await ubahAnggota("admin-1", tim, input, null);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("menyimpan anggota biasa dengan peran ANGGOTA", async () => {
    const anggotaId = "33333333-3333-4333-8333-333333333333";
    mocks.userFindMany.mockResolvedValue([{ id: anggotaId, role: "PEGAWAI", isActive: true, nama: "Budi" }]);
    const input = ubahAnggotaSchema.parse({ periodeId, tambah: [anggotaId] });

    const r = await ubahAnggota("admin-1", tim, input, null);

    expect(r.ok).toBe(true);
    expect(mocks.anggotaCreateMany).toHaveBeenCalledTimes(1);
    const payload = mocks.anggotaCreateMany.mock.calls[0][0];
    expect(payload.data[0]).toMatchObject({
      timId: tim.id,
      userId: anggotaId,
      periodeId: periodeAktif.id,
      peranDalamTim: "ANGGOTA",
    });
  });

  it("menolak pengguna yang tidak ditemukan", async () => {
    mocks.userFindMany.mockResolvedValue([]);
    const input = ubahAnggotaSchema.parse({ periodeId, tambah: [UUID] });
    const r = await ubahAnggota("admin-1", tim, input, null);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pesan).toMatch(/tidak ditemukan/i);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("menolak anggota yang tidak aktif atau peran tidak sesuai", async () => {
    mocks.userFindMany.mockResolvedValue([{ id: UUID, role: "PIMPINAN", isActive: true, nama: "X" }]);
    const input = ubahAnggotaSchema.parse({ periodeId, tambah: [UUID] });
    const r = await ubahAnggota("admin-1", tim, input, null);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pesan).toMatch(/tidak dapat menjadi anggota/i);
  });
});

describe("daftarAnggotaDenganKetua", () => {
  it("menampilkan ketua tim dari TimKerja.ketuaId walau tidak ada baris AnggotaTim", async () => {
    mocks.anggotaFindMany.mockResolvedValue([
      {
        id: "anggota-1",
        peranDalamTim: "ANGGOTA",
        user: { id: "user-budi", nip: "111", nama: "Budi", role: "PEGAWAI", jabatan: null, isActive: true },
      },
    ]);
    mocks.timFindUnique.mockResolvedValue({
      ketuaId: "user-ketua",
      ketua: { id: "user-ketua", nip: "222", nama: "Ratna", role: "KETUA_TIM", jabatan: null, isActive: true },
    });

    const r = await daftarAnggotaDenganKetua(tim.id, periodeId);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.anggota[0].userId).toBe("user-ketua");
      expect(r.anggota[0].peranDalamTim).toBe("KETUA");
      expect(r.anggota.map((a) => a.userId)).toEqual(["user-ketua", "user-budi"]);
    }
  });

  it("tidak menggandakan ketua yang kebetulan sudah ada sebagai anggota", async () => {
    mocks.anggotaFindMany.mockResolvedValue([
      {
        id: "anggota-1",
        peranDalamTim: "KETUA",
        user: { id: "user-ketua", nip: "222", nama: "Ratna", role: "KETUA_TIM", jabatan: null, isActive: true },
      },
    ]);
    mocks.timFindUnique.mockResolvedValue({
      ketuaId: "user-ketua",
      ketua: { id: "user-ketua", nip: "222", nama: "Ratna", role: "KETUA_TIM", jabatan: null, isActive: true },
    });

    const r = await daftarAnggotaDenganKetua(tim.id, periodeId);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.anggota.filter((a) => a.userId === "user-ketua")).toHaveLength(1);
  });
});
