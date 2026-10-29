import { describe, expect, it } from "vitest";
import { gabungkanAktivitas, type Aktivitas } from "./beranda-aktivitas";

const a = (tipe: Aktivitas["tipe"], id: string, tanggal: string, dibuat = "2026-10-14T01:00:00Z"): Aktivitas => ({
  tipe,
  id,
  judul: id,
  tanggal,
  href: "/x",
  dibuat,
});

describe("gabungkanAktivitas", () => {
  it("mengurutkan terbaru dulu lintas pekerjaan dan event", () => {
    const hasil = gabungkanAktivitas([a("pekerjaan", "p1", "2026-10-12"), a("pekerjaan", "p2", "2026-10-14")], [a("event", "e1", "2026-10-13")]);
    expect(hasil.map((x) => x.id)).toEqual(["p2", "e1", "p1"]);
  });

  it("memutus seri pada tanggal sama dengan waktu dibuat terbaru", () => {
    const hasil = gabungkanAktivitas(
      [a("pekerjaan", "lama", "2026-10-14", "2026-10-14T01:00:00Z")],
      [a("event", "baru", "2026-10-14", "2026-10-14T05:00:00Z")],
    );
    expect(hasil.map((x) => x.id)).toEqual(["baru", "lama"]);
  });

  it("dibatasi lima item secara bawaan dan dapat diatur", () => {
    const banyak = Array.from({ length: 4 }, (_, i) => a("pekerjaan", `p${i}`, `2026-10-0${i + 1}`));
    const evt = Array.from({ length: 4 }, (_, i) => a("event", `e${i}`, `2026-10-1${i}`));
    expect(gabungkanAktivitas(banyak, evt)).toHaveLength(5);
    expect(gabungkanAktivitas(banyak, evt, 2)).toHaveLength(2);
  });

  it("menangani daftar kosong", () => {
    expect(gabungkanAktivitas([], [])).toEqual([]);
  });

  it("tidak mengubah array masukan", () => {
    const p = [a("pekerjaan", "p1", "2026-10-01"), a("pekerjaan", "p2", "2026-10-02")];
    gabungkanAktivitas(p, []);
    expect(p.map((x) => x.id)).toEqual(["p1", "p2"]);
  });
});
