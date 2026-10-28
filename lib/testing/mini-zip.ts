import { crc32 } from "node:zlib";

/**
 * Pembuat ZIP minimal (tanpa kompresi) hanya untuk fixture uji: dokumen OOXML (docx/xlsx)
 * dikenali dari nama entri di dalam ZIP. TIDAK dipakai oleh kode aplikasi.
 */
export function miniZip(files: Record<string, string>): Buffer {
  const lokal: Buffer[] = [];
  const pusat: Buffer[] = [];
  let offset = 0;
  for (const [nama, isi] of Object.entries(files)) {
    const n = Buffer.from(nama);
    const d = Buffer.from(isi);
    const crc = crc32(d);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(d.length, 18);
    h.writeUInt32LE(d.length, 22);
    h.writeUInt16LE(n.length, 26);
    lokal.push(h, n, d);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(d.length, 20);
    c.writeUInt32LE(d.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    pusat.push(c, n);
    offset += h.length + n.length + d.length;
  }
  const dirPusat = Buffer.concat(pusat);
  const akhir = Buffer.alloc(22);
  akhir.writeUInt32LE(0x06054b50, 0);
  akhir.writeUInt16LE(Object.keys(files).length, 8);
  akhir.writeUInt16LE(Object.keys(files).length, 10);
  akhir.writeUInt32LE(dirPusat.length, 12);
  akhir.writeUInt32LE(offset, 16);
  return Buffer.concat([...lokal, dirPusat, akhir]);
}

const tipe = (bagian: string, contentType: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="xml" ContentType="application/xml"/><Override PartName="${bagian}" ContentType="${contentType}"/></Types>`;

export const contohDocx = () =>
  miniZip({
    "[Content_Types].xml": tipe("/word/document.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"),
    "word/document.xml": "<w:document/>",
  });
export const contohXlsx = () =>
  miniZip({
    "[Content_Types].xml": tipe("/xl/workbook.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"),
    "xl/workbook.xml": "<workbook/>",
  });

/** Header minimal yang dikenali sebagai tipe masing-masing. */
export const contohPng = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]),
    Buffer.from("IHDR"),
    Buffer.alloc(40),
  ]);
export const contohJpg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF"), Buffer.alloc(40)]);
export const contohPdf = () => Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
export const contohExe = () => Buffer.concat([Buffer.from("MZ"), Buffer.alloc(58), Buffer.from([0x80, 0, 0, 0]), Buffer.alloc(200)]);
