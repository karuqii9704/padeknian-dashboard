/**
 * Cegah formula injection di Excel: sel teks yang diawali = + - @ (atau TAB/CR) dianggap rumus oleh Excel.
 * Teks dari pengguna (nama, catatan) selalu lewat fungsi ini sebelum ditulis ke sel.
 */
export function amanSel(nilai: string | null | undefined): string {
  const s = (nilai ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

/** Nama sheet Excel: maksimal 31 karakter dan tanpa karakter terlarang \ / ? * [ ] : */
export function namaSheet(nama: string) {
  const bersih = nama.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().replace(/^'+|'+$/g, "");
  return (bersih || "Sheet").slice(0, 31);
}

/** Nama file aman untuk header Content-Disposition. */
export function namaFileAman(nama: string) {
  return nama.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "ekspor";
}
