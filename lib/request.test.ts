import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rbac", () => ({ HttpError: class extends Error {} }));
const { clientIp } = await import("./request");

const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });

describe("clientIp", () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
  });
  it("mengambil entri X-Forwarded-For yang ditambahkan proxy (paling kanan), bukan yang dikirim klien", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("TRUSTED_PROXY_HOPS=2 mengambil entri kedua dari kanan", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9, 10.0.0.2" }))).toBe("203.0.113.9");
  });
  it("jatuh ke x-real-ip lalu null", () => {
    expect(clientIp(req({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(req({}))).toBeNull();
  });
});
