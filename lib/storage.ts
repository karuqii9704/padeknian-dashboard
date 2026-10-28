import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

export const SIGNED_URL_MAKS_DETIK = 15 * 60;

export const BUCKET = () => process.env.S3_BUCKET ?? "bukti-dukung";

function buatClient(endpoint: string | undefined) {
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint,
    forcePathStyle: true, // wajib untuk MinIO / S3 self-hosted
    credentials: { accessKeyId: process.env.S3_KEY ?? "", secretAccessKey: process.env.S3_SECRET ?? "" },
    // MinIO lama tidak mengenal checksum tambahan yang kini dikirim SDK secara default.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

let internal: S3Client | undefined;
let publik: S3Client | undefined;

/** Klien untuk operasi server -> storage (put/delete). */
const klien = () => (internal ??= buatClient(process.env.S3_ENDPOINT));

/**
 * Klien khusus penandatanganan URL. Host pada signature harus host yang dipakai browser,
 * sehingga memakai S3_PUBLIC_ENDPOINT (di Docker: alamat yang bisa dijangkau browser).
 */
const klienPublik = () => (publik ??= buatClient(process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT));

let bucketSiap: Promise<void> | undefined;

/** Pastikan bucket ada. Bucket dibuat tanpa kebijakan publik (default privat). */
export function pastikanBucket() {
  bucketSiap ??= (async () => {
    try {
      await klien().send(new HeadBucketCommand({ Bucket: BUCKET() }));
    } catch {
      await klien().send(new CreateBucketCommand({ Bucket: BUCKET() }));
    }
  })().catch((e) => {
    bucketSiap = undefined; // coba lagi pada permintaan berikutnya
    throw e;
  });
  return bucketSiap;
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await pastikanBucket();
  await klien().send(new PutObjectCommand({ Bucket: BUCKET(), Key: key, Body: body, ContentType: contentType }));
}

/** Unggah dari stream (multipart) tanpa memuat seluruh isi ke memori; dipakai untuk ZIP berukuran besar. */
export async function putObjectStream(key: string, body: Readable, contentType: string) {
  await pastikanBucket();
  const up = new Upload({
    client: klien(),
    params: { Bucket: BUCKET(), Key: key, Body: body, ContentType: contentType },
    queueSize: 3,
    partSize: 8 * 1024 * 1024,
  });
  await up.done();
}

/** Baca objek sebagai stream. Melempar bila objek tidak ada. */
export async function getObjectStream(key: string): Promise<Readable> {
  const r = await klien().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
  if (!r.Body) throw new Error("Objek kosong");
  return r.Body as Readable;
}

export async function deleteObject(key: string) {
  await klien().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
}

function kodekanNama(nama: string) {
  // RFC 5987: nama berkarakter non-ASCII aman di header.
  return encodeURIComponent(nama).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * URL unduhan bertanda tangan. Umur dibatasi maksimum 15 menit (FR-29); nilai lebih besar dipotong.
 */
export function signedDownloadUrl(
  key: string,
  opts: { expiresIn?: number; namaFile: string; contentType: string; inline: boolean },
) {
  const expiresIn = Math.min(Math.max(1, opts.expiresIn ?? SIGNED_URL_MAKS_DETIK), SIGNED_URL_MAKS_DETIK);
  return getSignedUrl(
    klienPublik(),
    new GetObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${kodekanNama(opts.namaFile)}`,
    }),
    { expiresIn },
  );
}
