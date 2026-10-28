import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { SEL, statusSel, susunAnalitik } from "./dashboard-analitik";

const anggota = (userId: string, timId: string, nama: string, isActive = true) => ({
  userId,
  timId,
  user: { nama, nip: "1", isActive },
  tim: { nama: timId },
});

describe("statusSel", () => {
  it("kosong bila tidak ada entri", () => {
    expect(statusSel(undefined)).toBe(SEL.KOSONG);
    expect(statusSel({ jumlah: 0, disetujui: 0, menunggu: 0, revisi: 0 })).toBe(SEL.KOSONG);
  });
  it("revisi mengalahkan menunggu, menunggu mengalahkan disetujui", () => {
    expect(statusSel({ jumlah: 3, disetujui: 1, menunggu: 1, revisi: 1 })).toBe(SEL.REVISI);
    expect(statusSel({ jumlah: 2, disetujui: 1, menunggu: 1, revisi: 0 })).toBe(SEL.MENUNGGU);
    expect(statusSel({ jumlah: 2, disetujui: 2, menunggu: 0, revisi: 0 })).toBe(SEL.DISETUJUI);
  });
});

describe("susunAnalitik", () => {
  const c = {
    userIds: ["a", "b", "c"],
    anggota: [anggota("a", "t1", "Asri"), anggota("b", "t1", "Bayu"), anggota("c", "t2", "Citra"), anggota("c", "t1", "Citra")],
  };
  const tim = [
    { id: "t1", nama: "Tim Satu" },
    { id: "t2", nama: "Tim Dua" },
  ];
  const hk = ["2026-10-01", "2026-10-02"];
  const baris = [
    { user_id: "a", tanggal: "2026-10-01", jumlah: 2, disetujui: 2, menunggu: 0, revisi: 0 },
    { user_id: "a", tanggal: "2026-10-02", jumlah: 1, disetujui: 0, menunggu: 1, revisi: 0 },
    { user_id: "b", tanggal: "2026-10-02", jumlah: 1, disetujui: 0, menunggu: 0, revisi: 1 },
    // Akhir pekan: dihitung di status total tetapi tidak di tren/kepatuhan.
    { user_id: "c", tanggal: "2026-10-03", jumlah: 1, disetujui: 1, menunggu: 0, revisi: 0 },
  ];
  const r = susunAnalitik(c, tim, hk, baris);

  it("tren per hari kerja", () => {
    expect(r.tren).toEqual([
      { tanggal: "2026-10-01", entri: 2, disetujui: 2, menunggu: 0, revisi: 0, pegawai: 1 },
      { tanggal: "2026-10-02", entri: 2, disetujui: 0, menunggu: 1, revisi: 1, pegawai: 2 },
    ]);
  });

  it("sebaran status mencakup seluruh entri periode", () => {
    expect(r.status).toEqual({ disetujui: 3, menunggu: 1, revisi: 1 });
  });

  it("kepatuhan tim = hari terisi / (anggota × hari kerja)", () => {
    const t1 = r.perTim.find((t) => t.id === "t1")!;
    // a: 2 hari, b: 1 hari, c: 0 hari kerja (Sabtu tidak dihitung) => 3 / (3 × 2) = 50%
    expect(t1.anggota).toBe(3);
    expect(t1.persenKepatuhan).toBe(50);
    expect(r.perTim.find((t) => t.id === "t2")!.persenKepatuhan).toBe(0);
  });

  it("heatmap: paling sedikit terisi di atas, sel mengikuti hari kerja", () => {
    expect(r.heatmap.map((h) => h.nama)).toEqual(["Citra", "Bayu", "Asri"]);
    expect(r.heatmap.find((h) => h.userId === "a")!.sel).toEqual([SEL.DISETUJUI, SEL.MENUNGGU]);
    expect(r.heatmap.find((h) => h.userId === "b")!.sel).toEqual([SEL.KOSONG, SEL.REVISI]);
  });

  it("pegawai nonaktif tidak masuk heatmap maupun hitungan anggota tim", () => {
    const r2 = susunAnalitik({ userIds: ["a", "x"], anggota: [anggota("a", "t1", "Asri"), anggota("x", "t1", "Xena", false)] }, tim, hk, []);
    expect(r2.heatmap.map((h) => h.userId)).toEqual(["a"]);
    expect(r2.perTim[0].anggota).toBe(1);
  });
});
