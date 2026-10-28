import { describe, expect, it } from "vitest";
import { ADHOC, entriFormSchema, keBodyBaru, keBodyUbah } from "./entri-form";
import { labelTanggal, tanggalSingkat } from "./tanggal-id";

const dasar = {
  pilihan: "pen-1",
  tanggal: "2026-10-14",
  deskripsiCapaian: "Entri dokumen",
  volume: "12,5",
  status: "PROSES" as const,
  kendala: "",
};
const pesan = (v: unknown) => {
  const r = entriFormSchema.safeParse(v);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("entriFormSchema", () => {
  it("valid untuk entri terikat alokasi", () => expect(pesan(dasar)).toEqual([]));
  it("pesan Indonesia untuk field wajib", () => {
    const m = pesan({ ...dasar, pilihan: "", tanggal: "", deskripsiCapaian: " ", volume: "" });
    expect(m).toEqual(
      expect.arrayContaining([
        "pilihan: Pilih alokasi pekerjaan.",
        "tanggal: Tanggal wajib diisi.",
        "deskripsiCapaian: Deskripsi capaian wajib diisi.",
        "volume: Volume wajib diisi.",
      ]),
    );
  });
  it("volume tidak valid", () => {
    expect(pesan({ ...dasar, volume: "abc" })).toContain("volume: Volume harus berupa angka.");
    expect(pesan({ ...dasar, volume: "-1" })).toContain("volume: Volume tidak boleh negatif.");
    expect(pesan({ ...dasar, volume: "1,234" })).toContain("volume: Volume maksimal 2 angka desimal.");
    expect(pesan({ ...dasar, volume: "0" })).toEqual([]);
  });
  it("ad-hoc mewajibkan judul dan satuan", () => {
    expect(pesan({ ...dasar, pilihan: ADHOC })).toEqual(
      expect.arrayContaining(["judulAdHoc: Judul tugas tambahan wajib diisi.", "satuanAdHoc: Satuan wajib diisi."]),
    );
    expect(pesan({ ...dasar, pilihan: ADHOC, judulAdHoc: "Rapat", satuanAdHoc: "kegiatan" })).toEqual([]);
  });
});

describe("body API", () => {
  it("entri terikat alokasi", () => {
    expect(keBodyBaru(dasar)).toEqual({
      isAdHoc: false,
      penugasanId: "pen-1",
      tanggal: "2026-10-14",
      deskripsiCapaian: "Entri dokumen",
      volume: 12.5,
      status: "PROSES",
      kendala: null,
    });
  });
  it("ad-hoc membawa judul dan satuan, tanpa penugasanId", () => {
    const b = keBodyBaru({ ...dasar, pilihan: ADHOC, judulAdHoc: "Rapat", satuanAdHoc: "kegiatan", kendala: "Macet" });
    expect(b).toMatchObject({ isAdHoc: true, judulAdHoc: "Rapat", satuan: "kegiatan", kendala: "Macet" });
    expect(b).not.toHaveProperty("penugasanId");
  });
  it("ubah: ad-hoc menyertakan judul, non-ad-hoc tidak", () => {
    expect(keBodyUbah(dasar, false)).not.toHaveProperty("judulAdHoc");
    expect(keBodyUbah({ ...dasar, judulAdHoc: "R", satuanAdHoc: "k" }, true)).toMatchObject({ judulAdHoc: "R", satuan: "k" });
  });
});

describe("tanggal-id", () => {
  it("labelTanggal & tanggalSingkat", () => {
    expect(labelTanggal("2026-10-14")).toBe("Rabu, 14 Okt 2026");
    expect(labelTanggal("2026-10-10")).toBe("Sabtu, 10 Okt 2026");
    expect(tanggalSingkat("2026-12-01")).toBe("1 Des");
  });
});
