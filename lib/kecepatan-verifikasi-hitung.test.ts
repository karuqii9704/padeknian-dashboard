import { describe, expect, it } from "vitest";
import { hitungKecepatan, median, teksDurasi } from "./kecepatan-verifikasi-hitung";

describe("median & teksDurasi", () => {
  it("median ganjil/genap/kosong", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("format durasi", () => {
    expect(teksDurasi(0.5)).toBe("30 mnt");
    expect(teksDurasi(5.4)).toBe("5 jam");
    expect(teksDurasi(60)).toBe("2,5 hari");
    expect(teksDurasi(null)).toBe("–");
  });
});

describe("hitungKecepatan", () => {
  const tim = [
    { id: "A", nama: "Tim A", ketua: "Ketua A" },
    { id: "B", nama: "Tim B", ketua: "Ketua B" },
  ];
  const anggota = [
    { timId: "A", userId: "u1" },
    { timId: "A", userId: "u2" },
    { timId: "B", userId: "u3" },
    { timId: "B", userId: "u2" }, // u2 di dua tim
  ];
  it("mengelompokkan antrean & waktu selesai per tim; urut antrean terbanyak", () => {
    const r = hitungKecepatan({
      tim,
      anggota,
      menunggu: [
        { userId: "u1", jam: 10 },
        { userId: "u1", jam: 50 },
        { userId: "u2", jam: 30 },
      ],
      selesai: [
        { userId: "u3", jam: 4 },
        { userId: "u3", jam: 8 },
      ],
    });
    expect(r.ringkas).toMatchObject({ menunggu: 3, medianTungguJam: 30, tertuaJam: 50, medianSelesaiJam: 6, jumlahSelesai: 2 });
    expect(r.perTim[0]).toMatchObject({ timId: "A", menunggu: 3, medianTungguJam: 30, tertuaJam: 50, medianSelesaiJam: null });
    expect(r.perTim[1]).toMatchObject({ timId: "B", menunggu: 1, tertuaJam: 30, medianSelesaiJam: 6, jumlahSelesai: 2 });
  });
  it("tim tanpa data tetap muncul dengan nilai kosong", () => {
    const r = hitungKecepatan({ tim, anggota, menunggu: [], selesai: [] });
    expect(r.perTim.map((t) => t.menunggu)).toEqual([0, 0]);
    expect(r.ringkas.medianTungguJam).toBeNull();
  });
});
