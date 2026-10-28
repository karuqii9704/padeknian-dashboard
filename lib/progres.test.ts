import { describe, expect, it } from "vitest";
import { persen, susunAgregat } from "./progres";

describe("persen", () => {
  it("menghitung dan membulatkan 1 desimal", () => {
    expect(persen(30, 60)).toBe(50);
    expect(persen(1, 3)).toBe(33.3);
  });
  it("target 0 -> 0; boleh melebihi 100", () => {
    expect(persen(5, 0)).toBe(0);
    expect(persen(120, 100)).toBe(120);
  });
});

describe("susunAgregat", () => {
  it("hanya DISETUJUI masuk realisasi, MENUNGGU terpisah, lainnya diabaikan", () => {
    const m = susunAgregat([
      { penugasanId: "a", statusVerifikasi: "DISETUJUI", volume: 30 },
      { penugasanId: "a", statusVerifikasi: "MENUNGGU", volume: 10 },
      { penugasanId: "a", statusVerifikasi: "MINTA_REVISI", volume: 5 },
      { penugasanId: "a", statusVerifikasi: "DITOLAK", volume: 7 },
      { penugasanId: null, statusVerifikasi: "DISETUJUI", volume: 99 },
    ]);
    expect(m.get("a")).toEqual({ realisasi: 30, menunggu: 10 });
    expect(m.size).toBe(1);
  });
});
