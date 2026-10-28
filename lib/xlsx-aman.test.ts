import { describe, expect, it } from "vitest";
import { amanSel, namaFileAman, namaSheet } from "./xlsx-aman";

describe("amanSel", () => {
  it("memberi awalan ' pada teks yang berpotensi menjadi rumus", () => {
    expect(amanSel("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(amanSel("+1+1")).toBe("'+1+1");
    expect(amanSel("-2")).toBe("'-2");
    expect(amanSel("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(amanSel("\t=1")).toBe("'\t=1");
  });
  it("membiarkan teks biasa, null, dan undefined", () => {
    expect(amanSel("Pegawai Satu")).toBe("Pegawai Satu");
    expect(amanSel(null)).toBe("");
    expect(amanSel(undefined)).toBe("");
    expect(amanSel("a=b")).toBe("a=b");
  });
  it("membuang karakter kontrol", () => {
    expect(amanSel("ab\u0001c")).toBe("abc");
  });
});

describe("namaSheet", () => {
  it("memotong 31 karakter dan membuang karakter terlarang", () => {
    expect(namaSheet("A".repeat(50))).toHaveLength(31);
    expect(namaSheet("Budi/Santoso: [Tim]?*")).toBe("Budi Santoso Tim");
    expect(namaSheet("   ")).toBe("Sheet");
    expect(namaSheet("'diapit'")).toBe("diapit");
  });
});

describe("namaFileAman", () => {
  it("hanya karakter aman", () => {
    expect(namaFileAman("Rekap Okt 2026 / Tim A.xlsx")).toBe("Rekap-Okt-2026-Tim-A.xlsx");
    expect(namaFileAman("///")).toBe("ekspor");
  });
});
