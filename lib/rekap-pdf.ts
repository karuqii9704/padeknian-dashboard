import { createElement as h, type ReactElement, type ReactNode } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { RingkasanRekap } from "@/lib/rekap-hitung";
import { tanggalSingkat } from "@/lib/tanggal-id";

// File ini sengaja memakai createElement (bukan JSX) agar dapat dijalankan langsung oleh worker (tsx), dan memuat
// @react-pdf/renderer lewat import() dinamis: build CJS paket itu tidak dapat dimuat Node biasa (subpath exports),
// sedangkan build ESM-nya bisa.
type Pdf = typeof import("@react-pdf/renderer");

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const persen = (p: number | null) => (p === null ? "-" : `${fmt(p)}%`);
const tanggalTeks = (ts: string[]) => ts.map(tanggalSingkat).join(", ") || "-";

const buatGaya = (P: Pdf) => P.StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 9, color: "#111" },
  kop: { alignItems: "center", marginBottom: 10, borderBottomWidth: 1.5, borderBottomColor: "#111", paddingBottom: 6 },
  instansi: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  instansi2: { fontSize: 10 },
  judul: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 6 },
  sub: { textAlign: "center", marginBottom: 8, color: "#333" },
  idRow: { flexDirection: "row", marginBottom: 2 },
  idLabel: { width: 90, color: "#444" },
  idNilai: { flex: 1, fontFamily: "Helvetica-Bold" },
  bagian: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 10, marginBottom: 4 },
  tabel: { borderWidth: 0.75, borderColor: "#444" },
  baris: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#999" },
  barisHead: { flexDirection: "row", backgroundColor: "#e5e7eb", borderBottomWidth: 0.75, borderBottomColor: "#444" },
  sel: { paddingVertical: 3, paddingHorizontal: 3 },
  head: { fontFamily: "Helvetica-Bold" },
  kanan: { textAlign: "right" },
  catatan: { marginTop: 10, fontSize: 8, color: "#444" },
  ttd: { flexDirection: "row", justifyContent: "space-between", marginTop: 28 },
  ttdKotak: { width: "40%", alignItems: "center" },
  ttdGaris: { marginTop: 44, borderTopWidth: 0.75, borderTopColor: "#111", width: "100%", textAlign: "center", paddingTop: 2 },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: "#555" },
});

type Kolom = { judul: string; lebar: string; kanan?: boolean };

function tabel(P: Pdf, s: ReturnType<typeof buatGaya>, kolom: Kolom[], baris: string[][], kosong: string): ReactElement {
  const { View, Text } = P;
  return h(
    View,
    { style: s.tabel },
    h(
      View,
      { style: s.barisHead, wrap: false },
      ...kolom.map((k, i) => h(View, { key: i, style: [s.sel, { width: k.lebar }] }, h(Text, { style: [s.head, k.kanan ? s.kanan : {}] }, k.judul))),
    ),
    ...(baris.length === 0
      ? [h(View, { key: "kosong", style: s.baris }, h(View, { style: s.sel }, h(Text, null, kosong)))]
      : baris.map((b, r) =>
          h(
            View,
            { key: r, style: s.baris, wrap: false },
            ...b.map((v, i) => h(View, { key: i, style: [s.sel, { width: kolom[i].lebar }] }, h(Text, { style: kolom[i].kanan ? s.kanan : {} }, v))),
          ),
        )),
  );
}

/** Dokumen rekap satu pegawai (A4, siap cetak). Seluruh angka berasal dari ringkasan_json yang sama dengan XLSX. */
export function dokumenRekapPdf(P: Pdf, r: RingkasanRekap, versi: number): ReactElement<DocumentProps> {
  const { Document, Page, Text, View } = P;
  const s = buatGaya(P);
  const periode = `${BULAN[r.periode.bulan - 1]} ${r.periode.tahun}`;
  const dibuat = new Date(r.dibuatPada).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" });
  const id = (label: string, nilai: string): ReactNode => h(View, { style: s.idRow }, h(Text, { style: s.idLabel }, label), h(Text, { style: s.idNilai }, nilai));

  const alokasi = r.alokasi.map((a, i) => [
    String(i + 1),
    a.judul + (a.statusAlokasi === "DIBATALKAN" ? " (dibatalkan)" : ""),
    a.satuan,
    fmt(a.target),
    fmt(a.realisasi),
    persen(a.persen),
    fmt(a.menunggu),
    String(a.jumlahBukti),
    tanggalTeks(a.tanggalPelaksanaan),
  ]);
  const tambahan = r.tugasTambahan.map((t, i) => [String(i + 1), t.judul, t.satuan, fmt(t.realisasi), fmt(t.menunggu), String(t.jumlahBukti), tanggalTeks(t.tanggalPelaksanaan)]);
  const total = r.totalPerSatuan.map((t) => [t.satuan, fmt(t.disetujui), fmt(t.menunggu)]);

  return h(
    Document,
    { title: `Rekap ${r.pegawai.nama} ${periode}`, author: "BPS Kabupaten Kerinci", subject: "Rekap capaian kinerja bulanan" },
    h(
      Page,
      { size: "A4", style: s.page },
      h(
        View,
        { style: s.kop },
        h(Text, { style: s.instansi }, "BADAN PUSAT STATISTIK"),
        h(Text, { style: s.instansi2 }, "KABUPATEN KERINCI"),
      ),
      h(Text, { style: s.judul }, "REKAP CAPAIAN KINERJA BULANAN"),
      h(Text, { style: s.sub }, `Periode ${periode}`),

      id("Nama", r.pegawai.nama),
      id("NIP", r.pegawai.nip),
      id("Jabatan", r.pegawai.jabatan || "-"),
      id("Hari terisi", `${r.hariKerja.terisi} dari ${r.hariKerja.periode} hari kerja (${persen(r.hariKerja.persenTerisi)})`),
      id("Catatan disetujui", `${r.entri.disetujui} dari ${r.entri.total} catatan; ${r.jumlahBukti} berkas bukti`),

      h(Text, { style: s.bagian }, "A. Capaian per Alokasi"),
      tabel(
        P,
        s,
        [
          { judul: "No", lebar: "5%" },
          { judul: "Alokasi", lebar: "26%" },
          { judul: "Satuan", lebar: "9%" },
          { judul: "Target", lebar: "9%", kanan: true },
          { judul: "Realisasi", lebar: "10%", kanan: true },
          { judul: "%", lebar: "8%", kanan: true },
          { judul: "Menunggu", lebar: "10%", kanan: true },
          { judul: "Bukti", lebar: "7%", kanan: true },
          { judul: "Tanggal pelaksanaan", lebar: "16%" },
        ],
        alokasi,
        "Tidak ada alokasi pada periode ini.",
      ),

      h(Text, { style: s.bagian }, "B. Tugas Tambahan"),
      tabel(
        P,
        s,
        [
          { judul: "No", lebar: "6%" },
          { judul: "Tugas", lebar: "34%" },
          { judul: "Satuan", lebar: "11%" },
          { judul: "Realisasi", lebar: "11%", kanan: true },
          { judul: "Menunggu", lebar: "11%", kanan: true },
          { judul: "Bukti", lebar: "7%", kanan: true },
          { judul: "Tanggal pelaksanaan", lebar: "20%" },
        ],
        tambahan,
        "Tidak ada tugas tambahan.",
      ),

      h(Text, { style: s.bagian }, "C. Total per Satuan"),
      tabel(
        P,
        s,
        [
          { judul: "Satuan", lebar: "40%" },
          { judul: "Disetujui", lebar: "30%", kanan: true },
          { judul: "Menunggu verifikasi", lebar: "30%", kanan: true },
        ],
        total,
        "Belum ada capaian.",
      ),

      h(Text, { style: s.catatan }, "Hanya catatan berstatus Disetujui yang dihitung sebagai capaian. Volume Menunggu verifikasi dilaporkan terpisah dan belum termasuk capaian."),

      h(
        View,
        { style: s.ttd, wrap: false },
        h(View, { style: s.ttdKotak }, h(Text, null, "Pegawai"), h(Text, { style: s.ttdGaris }, r.pegawai.nama)),
        h(View, { style: s.ttdKotak }, h(Text, null, "Mengetahui, Ketua Tim"), h(Text, { style: s.ttdGaris }, " ")),
      ),

      h(
        View,
        { style: s.footer, fixed: true },
        h(Text, null, `Rekap versi ${versi} · dibuat ${dibuat}`),
        h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Halaman ${pageNumber} dari ${totalPages}` }),
      ),
    ),
  );
}

export async function renderRekapPdf(r: RingkasanRekap, versi: number): Promise<Buffer> {
  const P = await import("@react-pdf/renderer");
  return P.renderToBuffer(dokumenRekapPdf(P, r, versi));
}
