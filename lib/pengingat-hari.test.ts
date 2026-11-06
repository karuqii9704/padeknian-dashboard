import { describe, expect, it } from "vitest";
import { hariKerja, hariKerjaSebelumnya } from "./pengingat-hari";

const tanpaLibur = new Set<string>();

describe("hariKerjaSebelumnya", () => {
  it("Selasa -> Senin; Senin -> Jumat (melompati akhir pekan)", () => {
    expect(hariKerjaSebelumnya("2026-10-13", tanpaLibur)).toBe("2026-10-12");
    expect(hariKerjaSebelumnya("2026-10-12", tanpaLibur)).toBe("2026-10-09");
  });
  it("melompati hari libur", () => {
    expect(hariKerjaSebelumnya("2026-10-09", new Set(["2026-10-08"]))).toBe("2026-10-07");
  });
  it("null bila tidak ada hari kerja dalam batas mundur", () => {
    const libur = new Set(Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`));
    expect(hariKerjaSebelumnya("2026-10-21", libur, 14)).toBeNull();
  });
});

describe("hariKerja", () => {
  it("akhir pekan dan libur bukan hari kerja", () => {
    expect(hariKerja("2026-10-10", tanpaLibur)).toBe(false); // Sabtu
    expect(hariKerja("2026-10-08", new Set(["2026-10-08"]))).toBe(false);
    expect(hariKerja("2026-10-14", tanpaLibur)).toBe(true);
  });
});
