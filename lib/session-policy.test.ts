import { describe, expect, it } from "vitest";
import {
  IDLE_TIMEOUT_MS,
  LOGIN_WINDOW_MS,
  isIdleExpired,
  lockoutRemainingMs,
  sesiDicabut,
  sisaKunciLogin,
} from "./session-policy";

describe("isIdleExpired", () => {
  const now = 10_000_000;
  it("tidak kedaluwarsa tepat di batas 60 menit", () => {
    expect(isIdleExpired(now - IDLE_TIMEOUT_MS, now)).toBe(false);
  });
  it("kedaluwarsa bila idle > 60 menit", () => {
    expect(isIdleExpired(now - IDLE_TIMEOUT_MS - 1, now)).toBe(true);
  });
  it("abai bila lastActivity kosong", () => {
    expect(isIdleExpired(undefined, now)).toBe(false);
  });
});

describe("lockoutRemainingMs", () => {
  const now = 50_000_000;
  const at = (minAgo: number) => now - minAgo * 60_000;

  it("tidak terkunci dengan 4 kegagalan", () => {
    expect(lockoutRemainingMs([at(1), at(2), at(3), at(4)], now)).toBe(0);
  });
  it("terkunci pada kegagalan ke-5 sampai 15 menit setelah yang terbaru", () => {
    expect(lockoutRemainingMs([at(1), at(2), at(3), at(4), at(5)], now)).toBe(14 * 60_000);
  });
  it("kegagalan di luar jendela 15 menit tidak dihitung", () => {
    expect(lockoutRemainingMs([at(1), at(2), at(3), at(4), at(16)], now)).toBe(0);
  });
  it("kunci berakhir setelah 15 menit dari kegagalan terbaru", () => {
    const fails = [at(15), at(16), at(17), at(18), at(19)];
    expect(lockoutRemainingMs(fails, now)).toBe(0);
    expect(LOGIN_WINDOW_MS).toBe(15 * 60_000);
  });
});

describe("sesiDicabut", () => {
  const sejak = new Date(1_000_000);

  it("tidak dicabut bila password belum pernah diganti/di-reset", () => {
    expect(sesiDicabut(5, null)).toBe(false);
    expect(sesiDicabut(undefined, undefined)).toBe(false);
  });
  it("dicabut bila login sebelum password diganti", () => {
    expect(sesiDicabut(999_999, sejak)).toBe(true);
  });
  it("tetap berlaku bila login tepat atau setelah password diganti (sesi yang diterbitkan ulang)", () => {
    expect(sesiDicabut(1_000_000, sejak)).toBe(false);
    expect(sesiDicabut(1_000_001, sejak)).toBe(false);
  });
  it("token lama tanpa authAt ikut dicabut", () => {
    expect(sesiDicabut(undefined, sejak)).toBe(true);
  });
});

describe("sisaKunciLogin (akun+IP, akun global, IP)", () => {
  const now = 50_000_000;
  const at = (minAgo: number) => now - minAgo * 60_000;
  const gagal = (n: number, ip: string | null) => Array.from({ length: n }, (_, i) => ({ waktu: at(i + 1), ip }));

  it("5 kegagalan dari IP penyerang tidak mengunci pemilik akun di IP lain", () => {
    const akun = gagal(5, "6.6.6.6");
    expect(sisaKunciLogin(akun, [], "6.6.6.6", now)).toBeGreaterThan(0);
    expect(sisaKunciLogin(akun, [], "10.0.0.1", now)).toBe(0);
  });
  it("30 kegagalan dari banyak IP mengunci akun untuk semua IP", () => {
    const akun = Array.from({ length: 30 }, (_, i) => ({ waktu: at(1), ip: `1.1.1.${i}` }));
    expect(sisaKunciLogin(akun, [], "10.0.0.1", now)).toBeGreaterThan(0);
  });
  it("IP yang menebak 100 kali (akun mana pun) dikunci; 99 belum", () => {
    expect(sisaKunciLogin([], Array(99).fill(at(1)), "6.6.6.6", now)).toBe(0);
    expect(sisaKunciLogin([], Array(100).fill(at(1)), "6.6.6.6", now)).toBeGreaterThan(0);
  });
  it("tanpa IP: perilaku lama (5 kegagalan per akun)", () => {
    expect(sisaKunciLogin(gagal(5, null), [], null, now)).toBeGreaterThan(0);
  });
});
