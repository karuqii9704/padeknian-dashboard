#!/usr/bin/env bash
# Uji backup & restore: dump SUMBER_URL (format custom) -> pulihkan ke TUJUAN_URL -> bandingkan jumlah baris.
# TUJUAN harus database KOSONG/sekali pakai yang namanya mengandung "pulih" (pengaman agar tidak menimpa produksi).
#
#   SUMBER_URL=postgresql://...neon.../padeknian \
#   TUJUAN_URL=postgresql://localhost:15432/padeknian_pulih_uji \
#   bash scripts/uji-pemulihan.sh
#
# pg_dump/pg_restore harus versi >= versi server sumber. Berkas dump disimpan (BERKAS, bawaan backup-<tanggal>.dump).
set -euo pipefail

: "${SUMBER_URL:?Isi SUMBER_URL (database yang dicadangkan)}"
: "${TUJUAN_URL:?Isi TUJUAN_URL (database uji pemulihan)}"
BERKAS="${BERKAS:-backup-$(date +%F-%H%M).dump}"

nama_db() { local u="${1%%\?*}"; echo "${u##*/}"; }
TUJUAN_DB="$(nama_db "$TUJUAN_URL")"
if [[ "$TUJUAN_DB" != *pulih* ]]; then
  echo "Tolak: nama database tujuan ('$TUJUAN_DB') harus mengandung 'pulih'." >&2
  exit 1
fi
if [[ "$(nama_db "$SUMBER_URL")" == "$TUJUAN_DB" && "${SUMBER_URL%%@*}" == "${TUJUAN_URL%%@*}" ]]; then
  echo "Tolak: sumber dan tujuan sama." >&2
  exit 1
fi

echo "1/3 Mencadangkan sumber ke $BERKAS ..."
pg_dump --format=custom --no-owner --no-acl --file="$BERKAS" "$SUMBER_URL"

echo "2/3 Memulihkan ke $TUJUAN_DB ..."
pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname="$TUJUAN_URL" "$BERKAS"

echo "3/3 Membandingkan jumlah baris ..."
TABEL=(User TimKerja AnggotaTim Periode Alokasi PekerjaanHarian BuktiDukung Verifikasi Event EventLampiran RekapSKP Notifikasi AuditLog _prisma_migrations)
beda=0
printf '%-20s %12s %12s\n' "Tabel" "Sumber" "Pulihan"
for t in "${TABEL[@]}"; do
  a=$(psql "$SUMBER_URL" -Atc "SELECT count(*) FROM \"$t\"")
  b=$(psql "$TUJUAN_URL" -Atc "SELECT count(*) FROM \"$t\"")
  tanda=""; [[ "$a" != "$b" ]] && { tanda="  <-- BERBEDA"; beda=1; }
  printf '%-20s %12s %12s%s\n' "$t" "$a" "$b" "$tanda"
done

if [[ $beda -eq 0 ]]; then
  echo "BERHASIL: seluruh tabel cocok. Catat tanggal uji ini di log operasional."
else
  echo "GAGAL: ada tabel yang jumlah barisnya berbeda (catatan: sumber yang sedang dipakai bisa bertambah selama uji)." >&2
  exit 2
fi
