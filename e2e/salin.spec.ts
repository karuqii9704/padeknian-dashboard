import { expect, test } from "@playwright/test";
import { USERS } from "./support/data";
import { loginUI } from "./support/auth";

test.describe("Salin alokasi dari periode sebelumnya", () => {
  test("API: draft tanpa capaian/bukti, membawa penerima, menandai non-anggota, mengabaikan yang dibatalkan", async ({ page }) => {
    await loginUI(page, USERS.ketua.nip);
    const periode = (await (await page.request.get("/api/periode")).json()).data as { id: string; status: string }[];
    const aktif = periode.find((p) => p.status === "AKTIF")!;
    const tim = (await (await page.request.get("/api/tim")).json()).data[0];

    const res = await page.request.post("/api/alokasi/salin", { data: { timId: tim.id, periodeTujuanId: aktif.id } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.draft).toHaveLength(1);
    const d = body.draft[0];
    expect(d.judul).toBe("Pengolahan Susenas");
    expect(d.penugasan.map((p: { nama: string; tersedia: boolean }) => [p.nama, p.tersedia])).toEqual(
      expect.arrayContaining([[USERS.yul.nama, true], [USERS.dewi.nama, false]]),
    );
    expect(d).not.toHaveProperty("status");
    expect(d).not.toHaveProperty("realisasi");

    // Draft tidak menyimpan apa pun.
    const list = await (await page.request.get(`/api/alokasi?periodeId=${aktif.id}`)).json();
    expect(list.data.map((a: { judul: string }) => a.judul)).not.toContain("Pengolahan Susenas");
  });

  test("API: periode tujuan DIKUNCI ditolak 409", async ({ page }) => {
    await loginUI(page, USERS.ketua.nip);
    const periode = (await (await page.request.get("/api/periode")).json()).data as { id: string; status: string }[];
    const kunci = periode.find((p) => p.status === "DIKUNCI")!;
    const tim = (await (await page.request.get("/api/tim")).json()).data[0];
    const res = await page.request.post("/api/alokasi/salin", { data: { timId: tim.id, periodeTujuanId: kunci.id } });
    expect(res.status()).toBe(409);
    expect((await res.json()).pesan).toContain("dikunci");
  });

  test("UI: batal tidak menyimpan; tinjau, edit, lalu simpan menambah alokasi baru", async ({ page }) => {
    await loginUI(page, USERS.ketua.nip);
    await page.goto("/alokasi", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "+ Tambah alokasi" })).toBeEnabled();

    // Batal di tengah tinjauan: tidak ada efek samping.
    await page.getByRole("button", { name: "Salin dari bulan lalu" }).click();
    await expect(page.getByText("Pengolahan Susenas")).toBeVisible();
    await expect(page.getByText("Alokasi dibatalkan bulan lalu")).toHaveCount(0);
    await page.getByRole("button", { name: /^Tinjau/ }).click();
    await expect(page.getByRole("heading", { name: "Tinjau alokasi 1 dari 1" })).toBeVisible();
    await expect(page.getByLabel("Judul")).toHaveValue("Pengolahan Susenas");
    await expect(page.getByText(`Dilewati karena bukan anggota tim pada periode ini: ${USERS.dewi.nama}.`)).toBeVisible();
    await page.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Pengolahan Susenas" })).toHaveCount(0);

    // Ulangi, edit judul, simpan.
    await page.getByRole("button", { name: "Salin dari bulan lalu" }).click();
    await page.getByRole("button", { name: /^Tinjau/ }).click();
    await page.getByLabel("Judul").fill("Pengolahan Susenas (salinan)");
    await page.getByRole("button", { name: "Simpan alokasi" }).click();
    const kartu = page.getByRole("listitem").filter({ hasText: "Pengolahan Susenas (salinan)" }).first();
    await expect(kartu).toBeVisible();
    await expect(kartu.getByText(USERS.yul.nama)).toBeVisible();
    await expect(kartu.getByText(USERS.dewi.nama)).toHaveCount(0);
    await expect(kartu.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "0");
  });
});
