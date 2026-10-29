import { describe, expect, it } from "vitest";
import { jamJakarta, namaDepan, sapaan } from "./beranda-sapaan";

describe("sapaan", () => {
  it.each([
    [3, "Selamat malam"],
    [4, "Selamat pagi"],
    [10, "Selamat pagi"],
    [11, "Selamat siang"],
    [14, "Selamat siang"],
    [15, "Selamat sore"],
    [17, "Selamat sore"],
    [18, "Selamat malam"],
    [23, "Selamat malam"],
    [0, "Selamat malam"],
  ])("jam %i -> %s", (jam, salam) => {
    expect(sapaan(jam)).toBe(salam);
  });
});

describe("jamJakarta", () => {
  it("memakai zona Asia/Jakarta (UTC+7), termasuk lewat tengah malam", () => {
    expect(jamJakarta(new Date("2026-10-14T03:00:00Z"))).toBe(10);
    expect(jamJakarta(new Date("2026-10-14T17:30:00Z"))).toBe(0);
    expect(jamJakarta(new Date("2026-10-14T16:59:00Z"))).toBe(23);
  });
});

describe("namaDepan", () => {
  it("mengambil kata pertama tanpa gelar", () => {
    expect(namaDepan("Agus Setiawan, S.ST.")).toBe("Agus");
    expect(namaDepan("Siti Nurhaliza Putri")).toBe("Siti");
    expect(namaDepan("Administrator")).toBe("Administrator");
  });
});
