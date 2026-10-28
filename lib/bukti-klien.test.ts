import { describe, expect, it } from "vitest";
import { formatUkuran, periksaFileLokal, tipeTampilan } from "./bukti-klien";

describe("periksaFileLokal", () => {
  it("menerima format yang didukung", () => {
    for (const n of ["a.jpg", "a.JPEG", "b.png", "c.pdf", "d.docx", "e.xlsx"]) {
      expect(periksaFileLokal({ name: n, size: 1000 }, 0), n).toBeNull();
    }
  });
  it("menolak format lain, file kosong, > 10 MB, dan lebih dari 10 file", () => {
    expect(periksaFileLokal({ name: "x.exe", size: 10 }, 0)).toContain("tidak didukung");
    expect(periksaFileLokal({ name: "tanpa-ekstensi", size: 10 }, 0)).toContain("tidak didukung");
    expect(periksaFileLokal({ name: "a.pdf", size: 0 }, 0)).toBe("File kosong.");
    expect(periksaFileLokal({ name: "a.pdf", size: 10 * 1024 * 1024 + 1 }, 0)).toContain("10 MB");
    expect(periksaFileLokal({ name: "a.pdf", size: 10 * 1024 * 1024 }, 0)).toBeNull();
    expect(periksaFileLokal({ name: "a.pdf", size: 10 }, 10)).toContain("Maksimal 10 file");
  });
});

describe("tipeTampilan & formatUkuran", () => {
  it("memetakan jenis pratinjau", () => {
    expect(tipeTampilan("image/jpeg")).toBe("gambar");
    expect(tipeTampilan("application/pdf")).toBe("pdf");
    expect(tipeTampilan("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("dokumen");
  });
  it("format ukuran", () => {
    expect(formatUkuran(512)).toBe("512 B");
    expect(formatUkuran(2048)).toBe("2 KB");
    expect(formatUkuran(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
