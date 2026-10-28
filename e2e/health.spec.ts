import { expect, test } from "@playwright/test";

test("GET /api/health mengembalikan 200 dengan db ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect((await res.json()).db).toBe("ok");
});
