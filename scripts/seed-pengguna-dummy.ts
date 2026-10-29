// Akun dummy untuk uji coba (2 ketua tim + 4 pegawai, tanpa tim) dan periode bulan berjalan berstatus AKTIF.
// Bawaan dry-run: hanya mencetak rencana. Tulis ke database hanya dengan --ya.
//   DUMMY_PASSWORD='...' npx tsx scripts/seed-pengguna-dummy.ts             (dry-run)
//   DUMMY_PASSWORD='...' npx tsx scripts/seed-pengguna-dummy.ts --ya        (buat akun + periode)
//   npx tsx scripts/seed-pengguna-dummy.ts --nonaktifkan --ya               (nonaktifkan keenam akun)
import type { Role } from "@prisma/client";
import { db } from "../lib/db";
import { hariIni } from "../lib/clock";
import { hashPassword } from "../lib/password";
import { passwordBaruSchema } from "../lib/password-change";
import { aktifkanPeriode, buatPeriode } from "../lib/periode";

type Akun = { nip: string; nama: string; role: Extract<Role, "KETUA_TIM" | "PEGAWAI">; jabatan: string };

// NIP tidak bentrok dengan e2e/support/data.ts maupun scripts/seed-demo.ts.
const AKUN: Akun[] = [
  { nip: "197803122002121003", nama: "Agus Setiawan, S.ST.", role: "KETUA_TIM", jabatan: "Statistisi Ahli Madya" },
  { nip: "198106252006042002", nama: "Ratna Dewi Lestari, M.Stat.", role: "KETUA_TIM", jabatan: "Statistisi Ahli Muda" },
  { nip: "199207182015011004", nama: "Budi Hartono, S.Tr.Stat.", role: "PEGAWAI", jabatan: "Statistisi Ahli Pertama" },
  { nip: "199411052018032001", nama: "Siti Nurhaliza Putri", role: "PEGAWAI", jabatan: "Pranata Komputer Ahli Pertama" },
  { nip: "199603222019011005", nama: "Dedi Kurniawan", role: "PEGAWAI", jabatan: "Statistisi Penyelia" },
  { nip: "199509142019122003", nama: "Maya Anggraini", role: "PEGAWAI", jabatan: "Pengolah Data" },
];

const args = new Set(process.argv.slice(2));
const tulis = args.has("--ya");
const nonaktifkan = args.has("--nonaktifkan");

function cekTarget() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL belum diatur.");
  const u = new URL(url);
  const namaDb = u.pathname.replace(/^\//, "");
  if (/e2e/i.test(namaDb)) throw new Error(`Seed dummy menolak database E2E "${namaDb}".`);
  console.log(`Target : ${u.host}/${namaDb}`);
  console.log(`Mode   : ${tulis ? "TULIS (--ya)" : "dry-run (tambahkan --ya untuk menulis)"}`);
}

async function nonaktifkanAkun() {
  const nip = AKUN.map((a) => a.nip);
  const aktif = await db.user.findMany({ where: { nip: { in: nip }, isActive: true }, select: { nip: true, nama: true } });
  for (const u of aktif) console.log(`${tulis ? "nonaktifkan" : "akan dinonaktifkan"}: ${u.nip} ${u.nama}`);
  if (aktif.length === 0) console.log("Tidak ada akun dummy yang aktif.");
  if (tulis && aktif.length) {
    await db.user.updateMany({ where: { nip: { in: aktif.map((u) => u.nip) } }, data: { isActive: false } });
    await db.auditLog.create({ data: { aksi: "NONAKTIFKAN_PENGGUNA_DUMMY", entitas: "User", metadata: { jumlah: aktif.length } } });
  }
}

async function buatAkun(password: string | null) {
  for (const a of AKUN) {
    const ada = await db.user.findUnique({ where: { nip: a.nip } });
    if (ada) {
      const beda = ada.nama !== a.nama || ada.role !== a.role ? " (PERINGATAN: nama/peran berbeda dari rencana, tidak diubah)" : "";
      console.log(`dilewati (sudah ada): ${a.nip} ${ada.nama}${beda}`);
      continue;
    }
    console.log(`${tulis ? "buat" : "akan dibuat"}: ${a.nip} ${a.role.padEnd(9)} ${a.nama}`);
    if (!tulis || !password) continue;
    const u = await db.user.create({
      data: { nip: a.nip, nama: a.nama, role: a.role, jabatan: a.jabatan, email: null, passwordHash: await hashPassword(password), mustChangePassword: false },
    });
    await db.auditLog.create({ data: { aksi: "SEED_PENGGUNA_DUMMY", entitas: "User", entitasId: u.id } });
  }
}

/** Periode bulan berjalan (zona Asia/Jakarta). Hanya diaktifkan bila tidak ada periode AKTIF lain. */
async function siapkanPeriode() {
  const [tahun, bulan] = hariIni().split("-").map(Number);
  const admin = await db.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  if (!admin) throw new Error("Tidak ada admin aktif; jalankan `npm run seed` lebih dulu.");
  const label = `${tahun}-${String(bulan).padStart(2, "0")}`;

  let periode = await db.periode.findUnique({ where: { tahun_bulan: { tahun, bulan } } });
  const aktifLain = await db.periode.findFirst({ where: { status: "AKTIF", NOT: { tahun, bulan } }, select: { tahun: true, bulan: true } });

  if (periode?.status === "DIKUNCI") return console.log(`periode ${label}: DIKUNCI, tidak diubah (PERINGATAN: pegawai tidak bisa mencatat bulan ini)`);
  if (periode?.status === "AKTIF") return console.log(`periode ${label}: sudah AKTIF`);
  if (aktifLain) return console.log(`periode ${label}: tidak diaktifkan karena periode ${aktifLain.tahun}-${String(aktifLain.bulan).padStart(2, "0")} masih AKTIF (aktifkan manual lewat menu Periode)`);

  console.log(`periode ${label}: ${tulis ? "" : "akan "}${periode ? "diaktifkan" : "dibuat lalu diaktifkan"}`);
  if (!tulis) return;
  if (!periode) {
    const r = await buatPeriode(admin.id, { tahun, bulan }, null);
    if (!r.ok) throw new Error(r.pesan);
    periode = r.periode;
  }
  const a = await aktifkanPeriode(admin.id, periode.id, null);
  if (!a.ok) throw new Error(a.pesan);
}

async function main() {
  cekTarget();
  if (nonaktifkan) return nonaktifkanAkun();

  const pw = process.env.DUMMY_PASSWORD;
  if (!pw) throw new Error("DUMMY_PASSWORD wajib diisi (8-72 karakter); tidak ada nilai bawaan.");
  const cek = passwordBaruSchema.safeParse(pw);
  if (!cek.success) throw new Error(cek.error.issues[0]?.message ?? "DUMMY_PASSWORD tidak valid.");

  await buatAkun(pw);
  await siapkanPeriode();
  console.log(tulis ? "Selesai. Akun login dengan NIP di atas dan DUMMY_PASSWORD yang dipakai." : "Dry-run selesai; tidak ada yang ditulis.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
