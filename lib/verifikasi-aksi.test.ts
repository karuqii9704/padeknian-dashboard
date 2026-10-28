import { describe, expect, it } from "vitest";
import { STATUS_HASIL, verifikasiSchema } from "./verifikasi-aksi";

const pesan = (v: unknown) => {
  const r = verifikasiSchema.safeParse(v);
  return r.success ? null : r.error.issues[0].message;
};

describe("verifikasiSchema", () => {
  it("SETUJUI tanpa catatan valid; dengan catatan pendek juga valid", () => {
    expect(pesan({ aksi: "SETUJUI" })).toBeNull();
    expect(pesan({ aksi: "SETUJUI", catatan: "ok" })).toBeNull();
  });
  it("MINTA_REVISI dan TOLAK wajib catatan >= 10 karakter", () => {
    for (const aksi of ["MINTA_REVISI", "TOLAK"]) {
      expect(pesan({ aksi }), aksi).toBe("Catatan minimal 10 karakter untuk aksi ini.");
      expect(pesan({ aksi, catatan: "123456789" }), aksi).toBe("Catatan minimal 10 karakter untuk aksi ini.");
      expect(pesan({ aksi, catatan: "          " }), aksi).toBe("Catatan minimal 10 karakter untuk aksi ini.");
      expect(pesan({ aksi, catatan: "1234567890" }), aksi).toBeNull();
    }
  });
  it("catatan dihitung setelah di-trim", () => {
    expect(pesan({ aksi: "TOLAK", catatan: "  abcdefghi  " })).not.toBeNull(); // 9 karakter efektif
  });
  it("aksi tidak dikenal ditolak", () => {
    expect(pesan({ aksi: "HAPUS" })).toBe("Aksi verifikasi tidak valid.");
  });
  it("pemetaan aksi -> status", () => {
    expect(STATUS_HASIL).toEqual({ SETUJUI: "DISETUJUI", MINTA_REVISI: "MINTA_REVISI", TOLAK: "DITOLAK" });
  });
});
