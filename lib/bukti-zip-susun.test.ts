import { describe, expect, it } from "vitest";
import { buatManifestCsv, formatMb, MAKS_ZIP_BYTES, pesanZipTerlaluBesar, segmenAman, susunJalurZip } from "./bukti-zip-susun";

describe("segmenAman", () => {
  it("membuang pemisah path dan karakter berbahaya", () => {
    expect(segmenAman("../../etc/passwd")).toBe("etc passwd");
    expect(segmenAman("Entri: data/Sakernas?")).toBe("Entri data Sakernas");
    expect(segmenAman("...tersembunyi.")).toBe("tersembunyi");
    expect(segmenAman("///")).toBe("tanpa-nama");
    expect(segmenAman("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("susunJalurZip", () => {
  const item = (id: string, tanggal: string, kegiatan: string, namaFile: string) => ({ buktiId: id, tanggal, kegiatan, namaFile });

  it("terstruktur per tanggal lalu per alokasi", () => {
    const m = susunJalurZip("Bukti Yul Oktober 2026", [
      item("1", "2026-10-13", "Entri data Sakernas", "foto.jpg"),
      item("2", "2026-10-14", "Pengolahan Susenas", "scan.pdf"),
    ]);
    expect(m.get("1")).toBe("Bukti Yul Oktober 2026/2026-10-13/Entri data Sakernas/foto.jpg");
    expect(m.get("2")).toBe("Bukti Yul Oktober 2026/2026-10-14/Pengolahan Susenas/scan.pdf");
  });

  it("nama berkas kembar pada folder yang sama diberi akhiran, tanpa menimpa", () => {
    const m = susunJalurZip("Akar", [item("1", "2026-10-13", "K", "foto.jpg"), item("2", "2026-10-13", "K", "foto.jpg"), item("3", "2026-10-13", "K", "FOTO.jpg")]);
    expect([...m.values()]).toEqual(["Akar/2026-10-13/K/foto.jpg", "Akar/2026-10-13/K/foto (2).jpg", "Akar/2026-10-13/K/FOTO (3).jpg"]);
    expect(new Set([...m.values()].map((v) => v.toLowerCase())).size).toBe(3);
  });

  it("nama berkas berbahaya tidak keluar dari folder", () => {
    const m = susunJalurZip("Akar", [item("1", "2026-10-13", "K", "../../../evil.exe")]);
    expect(m.get("1")).toBe("Akar/2026-10-13/K/evil.exe");
    expect(m.get("1")).not.toContain("..");
  });
});

describe("buatManifestCsv", () => {
  it("memberi BOM, header, dan menutup sel agar tidak menjadi rumus", () => {
    const csv = buatManifestCsv([
      { jalur: "A/2026-10-13/K/f.jpg", tanggal: "2026-10-13", kegiatan: "=HYPERLINK(\"x\")", deskripsi: "Isi, dengan \"kutip\"", statusVerifikasi: "DISETUJUI", ukuranBytes: 10, checksumSha256: "abc" },
    ]);
    expect(csv.startsWith("﻿\"Jalur di ZIP\"")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).toContain("\"Isi, dengan \"\"kutip\"\"\"");
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(2);
  });
});

describe("batas & format", () => {
  it("batas 500 MB", () => expect(MAKS_ZIP_BYTES).toBe(500 * 1024 * 1024));
  it("formatMb memakai koma", () => expect(formatMb(1572864)).toBe("1,5"));
});

describe("pesanZipTerlaluBesar", () => {
  it("lolos tepat di batas, ditolak di atasnya dengan pesan Bahasa Indonesia", () => {
    expect(pesanZipTerlaluBesar(MAKS_ZIP_BYTES)).toBeNull();
    const p = pesanZipTerlaluBesar(MAKS_ZIP_BYTES + 1);
    expect(p).toContain("melebihi batas unduhan ZIP 500,0 MB");
  });
});
