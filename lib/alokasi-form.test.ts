import { describe, expect, it } from "vitest";
import { alokasiFormSchema, keBodyApi, parseAngka } from "./alokasi-form";
import { angkaRingkas, formatDaftarWhatsApp, tanggalPendek } from "./alokasi-format";

const valid = {
  judul: "Entri Sakernas",
  deskripsi: "Entri dokumen",
  tanggalMulai: "2026-10-05",
  tanggalSelesai: "2026-10-30",
  targetVolume: "100",
  satuan: "dokumen",
  prioritas: "TINGGI" as const,
  kegiatanId: "",
  penerima: [
    { userId: "u1", nama: "Yul", dipilih: true, targetVolume: "60" },
    { userId: "u2", nama: "Rina", dipilih: true, targetVolume: "" },
    { userId: "u3", nama: "Dewi", dipilih: false, targetVolume: "" },
  ],
};

const pesan = (v: unknown) => {
  const r = alokasiFormSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("alokasiFormSchema", () => {
  it("menerima form valid", () => {
    expect(pesan(valid)).toEqual([]);
  });
  it("pesan Bahasa Indonesia untuk field wajib kosong", () => {
    const m = pesan({ ...valid, judul: "", deskripsi: "", satuan: "", tanggalMulai: "", targetVolume: "" });
    expect(m).toContain("judul: Judul wajib diisi.");
    expect(m).toContain("deskripsi: Deskripsi wajib diisi.");
    expect(m).toContain("satuan: Satuan wajib diisi.");
    expect(m).toContain("tanggalMulai: Tanggal mulai wajib diisi.");
    expect(m).toContain("targetVolume: Target volume wajib diisi.");
  });
  it("menolak tanpa penerima", () => {
    const m = pesan({ ...valid, penerima: valid.penerima.map((p) => ({ ...p, dipilih: false })) });
    expect(m).toContain("penerima: Pilih minimal satu penerima.");
  });
  it("menolak selesai < mulai dan target tidak valid", () => {
    expect(pesan({ ...valid, tanggalSelesai: "2026-10-01" })).toContain("tanggalSelesai: Tanggal selesai tidak boleh sebelum tanggal mulai.");
    expect(pesan({ ...valid, targetVolume: "abc" })).toContain("targetVolume: Target volume harus berupa angka.");
    expect(pesan({ ...valid, targetVolume: "0" })).toContain("targetVolume: Target volume harus lebih dari 0.");
  });
  it("memvalidasi target per orang hanya untuk yang dipilih", () => {
    const v = { ...valid, penerima: [{ userId: "u1", nama: "Yul", dipilih: true, targetVolume: "-1" }, { userId: "u3", nama: "Dewi", dipilih: false, targetVolume: "-5" }] };
    expect(pesan(v)).toEqual(["penerima.0.targetVolume: Target Yul harus lebih dari 0."]);
  });
});

describe("keBodyApi", () => {
  it("hanya penerima terpilih; target kosong dihilangkan; koma desimal", () => {
    const body = keBodyApi({ ...valid, targetVolume: "100,5" }, "tim1", "per1");
    expect(body.targetVolume).toBe(100.5);
    expect(body.kegiatanId).toBeNull();
    expect(body.penugasan).toEqual([{ userId: "u1", targetVolume: 60 }, { userId: "u2" }]);
  });
  it("parseAngka", () => {
    expect(parseAngka("12,5")).toBe(12.5);
    expect(parseAngka(" ")).toBeNaN();
  });
});

describe("format WhatsApp", () => {
  it("tanggalPendek & angkaRingkas", () => {
    expect(tanggalPendek("2026-10-05")).toBe("5 Okt");
    expect(angkaRingkas("40.50")).toBe("40,5");
    expect(angkaRingkas("60.00")).toBe("60");
  });
  it("daftar berisi judul, penerima, rentang, prioritas", () => {
    const t = formatDaftarWhatsApp("Alokasi Oktober 2026 — Tim A", [
      { judul: "Entri Sakernas", tanggalMulai: "2026-10-05", tanggalSelesai: "2026-10-30", satuan: "dokumen", prioritas: "TINGGI", penugasan: [{ nama: "Yul", targetVolume: "60.00" }, { nama: "Rina", targetVolume: "40.50" }] },
    ]);
    expect(t).toBe("*Alokasi Oktober 2026 — Tim A*\n\n1. Entri Sakernas\n   Yul 60 dokumen; Rina 40,5 dokumen\n   5 Okt – 30 Okt · Prioritas Tinggi");
  });
  it("daftar kosong", () => {
    expect(formatDaftarWhatsApp("H", [])).toBe("*H*\n(Belum ada alokasi)");
  });
});
