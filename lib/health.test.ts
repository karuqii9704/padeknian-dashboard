import { describe, expect, it } from "vitest";
import { checkHealth } from "./health";

describe("checkHealth", () => {
  it("mengembalikan ok bila DB merespons", async () => {
    const r = await checkHealth(async () => 1);
    expect(r.status).toBe("ok");
    expect(r.db).toBe("ok");
  });

  it("mengembalikan error bila DB gagal", async () => {
    const r = await checkHealth(async () => {
      throw new Error("down");
    });
    expect(r.status).toBe("error");
    expect(r.db).toBe("error");
  });
});
