import { describe, expect, it } from "vitest";
import { MAKS_UKURAN_BYTES, buatObjectKey, sanitasiNamaFile, validasiFileBukti } from "./bukti-file";
import { contohDocx, contohExe, contohJpg, contohPdf, contohPng, contohXlsx } from "./testing/mini-zip";

const cek = (bytes: Uint8Array, tipeDeklarasi?: string) => validasiFileBukti({ bytes, tipeDeklarasi });

describe("validasiFileBukti — tipe diizinkan (magic bytes)", () => {
  it.each([
    ["jpg", contohJpg(), "image/jpeg", "jpg"],
    ["png", contohPng(), "image/png", "png"],
    ["pdf", contohPdf(), "application/pdf", "pdf"],
    ["docx", contohDocx(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
    ["xlsx", contohXlsx(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ])("menerima %s", async (_n, buf, mime, ext) => {
    expect(await cek(buf)).toEqual({ ok: true, mime, ext });
    expect(await cek(buf, mime)).toEqual({ ok: true, mime, ext });
  });

  it("menerima image/jpg sebagai alias image/jpeg dan octet-stream sebagai tanpa petunjuk", async () => {
    expect((await cek(contohJpg(), "image/jpg")).ok).toBe(true);
    expect((await cek(contohPdf(), "application/octet-stream")).ok).toBe(true);
  });
});

describe("validasiFileBukti — penolakan", () => {
  it(".exe yang dinamai .pdf ditolak karena isinya bukan PDF", async () => {
    const r = await cek(contohExe(), "application/pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pesan).toContain("Isi file tidak sesuai");
  });
  it(".exe tanpa deklarasi MIME juga ditolak", async () => {
    expect((await cek(contohExe())).ok).toBe(false);
  });
  it("teks biasa ditolak", async () => {
    expect((await cek(Buffer.from("halo dunia, ini bukan gambar"))).ok).toBe(false);
  });
  it("isi PDF tetapi dinyatakan PNG ditolak (tipe tidak cocok)", async () => {
    const r = await cek(contohPdf(), "image/png");
    expect(r.ok === false && r.pesan).toContain("tidak sesuai dengan tipe yang dinyatakan");
  });
  it("MIME yang dideklarasikan di luar daftar ditolak", async () => {
    const r = await cek(contohPdf(), "application/x-msdownload");
    expect(r.ok === false && r.pesan).toContain("Tipe file tidak didukung");
  });
  it("file kosong ditolak; > 10 MB ditolak 413; tepat 10 MB lolos batas ukuran", async () => {
    expect(await cek(new Uint8Array(0))).toMatchObject({ ok: false, status: 400 });
    expect(await cek(new Uint8Array(MAKS_UKURAN_BYTES + 1))).toMatchObject({ ok: false, status: 413 });
    const sepuluhMb = Buffer.concat([contohPdf(), Buffer.alloc(MAKS_UKURAN_BYTES - contohPdf().length)]);
    expect(sepuluhMb.length).toBe(MAKS_UKURAN_BYTES);
    expect((await cek(sepuluhMb, "application/pdf")).ok).toBe(true);
  });
  it("zip biasa (bukan OOXML) ditolak", async () => {
    const { miniZip } = await import("./testing/mini-zip");
    expect((await cek(miniZip({ "catatan.txt": "x" }))).ok).toBe(false);
  });
});

describe("sanitasiNamaFile", () => {
  it("membuang path dan karakter berbahaya", () => {
    expect(sanitasiNamaFile("../../etc/passwd")).toBe("passwd");
    expect(sanitasiNamaFile("C:\\Users\\x\\laporan:final?.pdf")).toBe("laporanfinal.pdf");
    expect(sanitasiNamaFile("a<b>c|d.png")).toBe("abcd.png");
  });
  it("membuang karakter kontrol & titik di awal/akhir; nama kosong -> berkas", () => {
    expect(sanitasiNamaFile("\u0000\u0007foto\u001f.jpg")).toBe("foto.jpg");
    expect(sanitasiNamaFile("...tersembunyi")).toBe("tersembunyi");
    expect(sanitasiNamaFile("???")).toBe("berkas");
    expect(sanitasiNamaFile("")).toBe("berkas");
  });
  it("mempertahankan huruf Indonesia/Unicode dan membatasi 255 karakter dengan ekstensi", () => {
    expect(sanitasiNamaFile("Laporan Kegiatan – Pengolahan.pdf")).toBe("Laporan Kegiatan – Pengolahan.pdf");
    const panjang = sanitasiNamaFile(`${"a".repeat(400)}.pdf`);
    expect(panjang.length).toBe(255);
    expect(panjang.endsWith(".pdf")).toBe(true);
  });
});

describe("buatObjectKey", () => {
  it("format periode/YYYY-MM/userId/uuid.ext", () => {
    expect(buatObjectKey({ tahun: 2026, bulan: 3, userId: "u1", uuid: "abc", ext: "jpg" })).toBe("periode/2026-03/u1/abc.jpg");
  });
});
