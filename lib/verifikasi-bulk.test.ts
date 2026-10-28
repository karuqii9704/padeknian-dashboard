import { describe, expect, it } from "vitest";
import { bulkSchema, statusBatch } from "./verifikasi-bulk";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("bulkSchema", () => {
  it("menerima 1..100 id unik", () => {
    expect(bulkSchema.safeParse({ ids: [id(1)] }).success).toBe(true);
    expect(bulkSchema.safeParse({ ids: Array.from({ length: 100 }, (_, i) => id(i + 1)) }).success).toBe(true);
  });
  it("menolak kosong, > 100, duplikat, dan id tidak valid", () => {
    expect(bulkSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: Array.from({ length: 101 }, (_, i) => id(i + 1)) }).success).toBe(false);
    const dup = bulkSchema.safeParse({ ids: [id(1), id(1)] });
    expect(dup.success).toBe(false);
    expect(bulkSchema.safeParse({ ids: ["bukan-uuid"] }).success).toBe(false);
  });
});

describe("statusBatch", () => {
  it("akses (404/403) didahulukan dari kondisi (409)", () => {
    expect(statusBatch([{ status: 409 }, { status: 403 }])).toBe(403);
    expect(statusBatch([{ status: 409 }, { status: 404 }, { status: 403 }])).toBe(404);
    expect(statusBatch([{ status: 409 }])).toBe(409);
  });
});
