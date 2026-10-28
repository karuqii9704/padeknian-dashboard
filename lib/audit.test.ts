import { describe, expect, it, vi } from "vitest";
import { tulisAudit } from "./audit";
import { hashPassword, verifyPassword } from "./password";

describe("tulisAudit", () => {
  it("hanya memanggil create dengan default null", async () => {
    const create = vi.fn().mockResolvedValue({ id: BigInt(1) });
    const client = { auditLog: { create } } as never;
    await tulisAudit({ aksi: "LOGIN", entitas: "User" }, client);
    expect(create).toHaveBeenCalledWith({
      data: {
        userId: null,
        aksi: "LOGIN",
        entitas: "User",
        entitasId: null,
        metadata: undefined,
        ipAddress: null,
      },
    });
  });
});

describe("password", () => {
  it("memakai bcrypt cost 12 dan bisa diverifikasi", async () => {
    const h = await hashPassword("rahasia-123");
    expect(h.startsWith("$2b$12$") || h.startsWith("$2a$12$")).toBe(true);
    expect(await verifyPassword("rahasia-123", h)).toBe(true);
    expect(await verifyPassword("salah", h)).toBe(false);
  });
});
