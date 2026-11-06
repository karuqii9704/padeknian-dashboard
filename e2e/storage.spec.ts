import { expect, test } from "@playwright/test";
import { buatPrisma } from "../lib/prisma-klien";
import { sebagai } from "./support/api";
import { USERS } from "./support/data";

const prisma = buatPrisma();
test.afterAll(() => prisma.$disconnect());

test("admin melihat pemakaian penyimpanan yang cocok dengan database; peran lain tidak", async ({ browser }) => {
  const [b, l] = await Promise.all([prisma.buktiDukung.aggregate({ _sum: { ukuranBytes: true } }), prisma.eventLampiran.aggregate({ _sum: { ukuranBytes: true } })]);
  const total = Number(b._sum.ukuranBytes ?? 0) + Number(l._sum.ukuranBytes ?? 0);

  const admin = await sebagai(browser, USERS.admin.nip);
  await admin.page.goto("/admin/periode");
  const panel = admin.page.getByRole("region", { name: "Pemakaian penyimpanan" });
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-storage-total]")).toHaveAttribute("data-storage-total", String(total));
  await admin.tutup();

  const pim = await sebagai(browser, USERS.pimpinan.nip);
  await pim.page.goto("/admin/periode");
  await expect(pim.page.getByRole("region", { name: "Pemakaian penyimpanan" })).toHaveCount(0);
  await pim.tutup();
});
