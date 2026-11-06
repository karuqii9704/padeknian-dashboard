export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

/** Kegagalan per pasangan akun+IP sebelum dikunci (penyerang dari IP lain tidak mengunci pemilik akun). */
export const LOGIN_MAX_FAILURES = 5;
/** Pengaman global per akun (serangan dari banyak IP). */
export const LOGIN_MAX_AKUN = 30;
/** Pengaman per IP (menebak banyak akun). Longgar karena satu kantor sering berbagi satu IP publik (NAT). */
export const LOGIN_MAX_IP = 100;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const secure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");

export const SESSION_COOKIE_NAME = `${secure ? "__Secure-" : ""}padeknian.session-token`;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure,
};

/**
 * Sesi dicabut bila login (authAt, ms) terjadi sebelum `berlakuSejak` (password diganti/di-reset).
 * Token lama tanpa authAt dianggap login di awal waktu sehingga ikut dicabut.
 */
export function sesiDicabut(authAtMs: number | undefined, berlakuSejak: Date | null | undefined) {
  if (!berlakuSejak) return false;
  return (authAtMs ?? 0) < berlakuSejak.getTime();
}

export function isIdleExpired(lastActivityMs: number | undefined, nowMs: number) {
  return typeof lastActivityMs === "number" && nowMs - lastActivityMs > IDLE_TIMEOUT_MS;
}

/**
 * Hitung sisa lockout dari daftar waktu percobaan gagal.
 * Terkunci bila ada >= `maks` kegagalan (bawaan 5) dalam 15 menit terakhir; kunci berakhir
 * 15 menit setelah kegagalan terbaru. Mengembalikan sisa ms (0 = tidak terkunci).
 */
export function lockoutRemainingMs(failureTimesMs: number[], nowMs: number, maks = LOGIN_MAX_FAILURES) {
  const recent = failureTimesMs
    .filter((t) => nowMs - t < LOGIN_WINDOW_MS)
    .sort((a, b) => b - a);
  if (recent.length < maks) return 0;
  return Math.max(0, recent[0] + LOGIN_WINDOW_MS - nowMs);
}

/**
 * Sisa waktu kunci login (ms) dari tiga lapis: pasangan akun+IP (5), akun global (30), dan IP (100).
 * `gagalAkun` = kegagalan untuk identifier ini dari IP mana pun; `gagalIp` = kegagalan dari IP ini untuk akun mana pun.
 */
export function sisaKunciLogin(
  gagalAkun: { waktu: number; ip: string | null }[],
  gagalIp: number[],
  ip: string | null,
  nowMs: number,
) {
  const pasangan = gagalAkun.filter((g) => g.ip === ip).map((g) => g.waktu);
  return Math.max(
    lockoutRemainingMs(pasangan, nowMs, LOGIN_MAX_FAILURES),
    lockoutRemainingMs(gagalAkun.map((g) => g.waktu), nowMs, LOGIN_MAX_AKUN),
    ip ? lockoutRemainingMs(gagalIp, nowMs, LOGIN_MAX_IP) : 0,
  );
}
