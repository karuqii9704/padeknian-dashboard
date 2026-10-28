import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { HttpError, handle, isOwner, requireOwner, roleAllowed } from "./rbac";

describe("roleAllowed", () => {
  it("mengizinkan peran yang terdaftar", () => {
    expect(roleAllowed("ADMIN", ["ADMIN", "PIMPINAN"])).toBe(true);
  });
  it("menolak peran di luar daftar", () => {
    expect(roleAllowed("PEGAWAI", ["ADMIN", "PIMPINAN"])).toBe(false);
  });
});

describe("kepemilikan", () => {
  const u = { id: "a", nip: "1", role: "PEGAWAI" as const };
  it("isOwner", () => {
    expect(isOwner(u, "a")).toBe(true);
    expect(isOwner(u, "b")).toBe(false);
  });
  it("requireOwner melempar 403 untuk data orang lain", () => {
    expect(() => requireOwner(u, "b")).toThrowError(HttpError);
    try {
      requireOwner(u, "b");
    } catch (e) {
      expect((e as HttpError).status).toBe(403);
    }
  });
  it("requireOwner lolos untuk peran bypass", () => {
    expect(() => requireOwner({ ...u, role: "KETUA_TIM" }, "b", ["KETUA_TIM"])).not.toThrow();
  });
});

describe("handle", () => {
  it("memetakan HttpError ke JSON dengan status yang sama", async () => {
    const h = handle(async () => {
      throw new HttpError(403, "Dilarang.");
    });
    const res = await h();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ pesan: "Dilarang." });
  });
});
