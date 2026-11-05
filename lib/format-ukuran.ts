// Murni (aman diimpor dari klien dan diuji).

/** "1,5 MB", "820 KB" (basis 1024). */
export function ukuran(bytes: number) {
  const satuan = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < satuan.length - 1) {
    n /= 1024;
    i++;
  }
  return `${(Math.round(n * 10) / 10).toLocaleString("id-ID")} ${satuan[i]}`;
}
