export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const secure = (process.env.NEXTAUTH_URL ?? "").startsWith("https://");

export const SESSION_COOKIE_NAME = `${secure ? "__Secure-" : ""}padeknian.session-token`;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure,
};

export function isIdleExpired(lastActivityMs: number | undefined, nowMs: number) {
  return typeof lastActivityMs === "number" && nowMs - lastActivityMs > IDLE_TIMEOUT_MS;
}

/**
 * Hitung sisa lockout dari daftar waktu percobaan gagal.
 * Terkunci bila ada >= 5 kegagalan dalam 15 menit terakhir; kunci berakhir
 * 15 menit setelah kegagalan terbaru. Mengembalikan sisa ms (0 = tidak terkunci).
 */
export function lockoutRemainingMs(failureTimesMs: number[], nowMs: number) {
  const recent = failureTimesMs
    .filter((t) => nowMs - t < LOGIN_WINDOW_MS)
    .sort((a, b) => b - a);
  if (recent.length < LOGIN_MAX_FAILURES) return 0;
  return Math.max(0, recent[0] + LOGIN_WINDOW_MS - nowMs);
}
