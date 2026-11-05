import { describe, expect, it } from "vitest";
import {
  IDLE_TIMEOUT_MS,
  LOGIN_WINDOW_MS,
  isIdleExpired,
  lockoutRemainingMs,
  sesiDicabut,
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
