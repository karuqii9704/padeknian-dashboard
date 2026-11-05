import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { sebagai } from "./support/api";
import { E2E_PASSWORD, USERS } from "./support/data";

// Kunci login per pasangan akun+IP: penyerang yang salah password berulang dari IP-nya sendiri
// tidak dapat mengunci pemilik akun yang login dari IP lain.
const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

test("5 kali salah dari IP penyerang mengunci IP itu saja; pemilik akun tetap bisa login dari IP lain", async ({ browser, playwright, baseURL }) => {
  const admin = await sebagai(browser, USERS.admin.nip);
  const nip = `19960${Date.now()}`;
  const r = await admin.request.post("/api/pengguna", { data: { nip, nama: "Uji Kunci Login", role: "PEGAWAI", password: E2E_PASSWORD } });
  expect(r.status()).toBe(201);
  const id = (await r.json()).user.id as string;
  await prisma.user.update({ where: { id }, data: { mustChangePassword: false } });

  const api = await playwright.request.newContext({ baseURL });
  const login = (password: string, ip: string) =>
    api.post("/api/auth/login", { data: { identifier: nip, password }, headers: { "x-forwarded-for": ip } });

  for (let i = 0; i < 5; i++) expect((await login("salah-salah", "198.51.100.66")).status()).toBe(401);
  const terkunci = await login(E2E_PASSWORD, "198.51.100.66");
  expect(terkunci.status()).toBe(429);
  expect(Number(terkunci.headers()["retry-after"])).toBeGreaterThan(0);

  // Percobaan gagal tercatat dengan IP-nya (untuk audit dan pembatasan).
  const ips = await prisma.loginAttempt.findMany({ where: { identifier: nip }, select: { ipAddress: true } });
  expect(ips.map((x) => x.ipAddress)).toEqual(Array(5).fill("198.51.100.66"));

  // Pemilik dari IP lain tidak terdampak.
  expect((await login(E2E_PASSWORD, "203.0.113.10")).status()).toBe(200);

  await admin.request.patch(`/api/pengguna/${id}`, { data: { isActive: false } });
  await api.dispose();
  await admin.tutup();
});
