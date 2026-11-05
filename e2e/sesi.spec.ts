import { expect, request as pw, test, type APIRequestContext } from "@playwright/test";
import { E2E_PASSWORD, USERS } from "./support/data";

// Pencabutan sesi: setelah password diganti (atau di-reset admin) sesi lain wajib login ulang,
// sedangkan perangkat yang mengganti password tetap masuk.

async function konteks(baseURL: string) {
  return pw.newContext({ baseURL });
}

async function login(ctx: APIRequestContext, identifier: string, password: string) {
  const r = await ctx.post("/api/auth/login", { data: { identifier, password } });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

test("ganti password mencabut sesi lain; reset admin mencabut semua sesi", async ({ baseURL }) => {
  const admin = await konteks(baseURL!);
  const a = await konteks(baseURL!);
  const b = await konteks(baseURL!);
  try {
    await login(admin, USERS.admin.nip, E2E_PASSWORD);
    const nip = `19990${Date.now()}`; // 18 digit, unik per run
    const buat = await admin.post("/api/pengguna", { data: { nip, nama: "Uji Sesi", role: "PEGAWAI" } });
    expect(buat.status()).toBe(201);
    const { user, passwordSementara } = await buat.json();

    // Perangkat A: login dengan password sementara lalu menggantinya.
    expect((await login(a, nip, passwordSementara)).mustChangePassword).toBe(true);
    const p1 = "Sesi-Pertama-123";
    expect((await a.patch("/api/me/password", { data: { passwordLama: passwordSementara, passwordBaru: p1 } })).status()).toBe(200);
    expect((await a.get("/api/me")).status()).toBe(200); // sesi A diterbitkan ulang

    // Perangkat B login dengan password baru; lalu A mengganti password lagi -> B dicabut, A tetap.
    await login(b, nip, p1);
    expect((await b.get("/api/me")).status()).toBe(200);
    expect((await a.patch("/api/me/password", { data: { passwordLama: p1, passwordBaru: "Sesi-Kedua-456" } })).status()).toBe(200);
    expect((await b.get("/api/me")).status()).toBe(401);
    expect((await b.get("/api/pekerjaan-harian")).status()).toBe(401);
    expect((await a.get("/api/me")).status()).toBe(200);

    // Reset oleh admin mencabut sesi A juga.
    expect((await admin.post(`/api/pengguna/${user.id}/reset-password`)).status()).toBe(200);
    expect((await a.get("/api/me")).status()).toBe(401);

    await admin.patch(`/api/pengguna/${user.id}`, { data: { isActive: false } });
  } finally {
    await Promise.all([admin.dispose(), a.dispose(), b.dispose()]);
  }
});

test("respons membawa header keamanan dasar", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("URL tak dikenal menampilkan halaman 404 kustom", async ({ page }) => {
  const res = await page.goto("/halaman-yang-tidak-ada");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
});
