import { expect, test } from "@playwright/test";

async function mockRegistration(page) {
  await page.route("http://localhost:8080/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "authentication_required" }),
      });
      return;
    }
    if (path === "/api/v1/auth/registration") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { bootstrapRequired: true, mode: "closed" },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "not_found" }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockRegistration(page);
});

test("administrator registration starts inside a short desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1872, height: 720 });
  await page.goto("/");

  const card = page.locator(".auth-card");
  await expect(
    page.getByRole("heading", { name: "Create the administrator" }),
  ).toBeVisible();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box.y).toBeGreaterThanOrEqual(0);

  await page.getByRole("button", { name: "Create passkey" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Create passkey" })).toBeVisible();
});

test("administrator registration fits mobile width without horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile only");
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Create the administrator" }),
  ).toBeVisible();
  await expect(page.locator(".auth-intro")).toBeHidden();
  const overflow = await page
    .locator("#root")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Create passkey" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Create passkey" })).toBeVisible();
});
