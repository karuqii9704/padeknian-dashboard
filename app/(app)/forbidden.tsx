import Link from "next/link";
import { Halaman, PageHeader } from "../ui/primitives";

/** Ditampilkan (HTTP 403) saat halaman memanggil forbidden(): peran pengguna tidak berhak membuka halaman ini. */
export default function AksesDitolak() {
  return (
    <Halaman lebar="max-w-xl">
      <PageHeader
        judul="Akses ditolak"
        keterangan="Halaman ini tidak tersedia untuk peran akun Anda. Gunakan menu di samping untuk halaman yang dapat Anda buka."
      />
      <div className="flex flex-wrap gap-2">
        <Link href="/" className="btn btn-primary">Ke halaman awal</Link>
        <Link href="/bantuan" className="btn btn-secondary">Lihat panduan peran Anda</Link>
      </div>
    </Halaman>
  );
}
