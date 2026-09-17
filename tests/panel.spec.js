import { expect, test } from "@playwright/test";

const team = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Nextarch Studio",
  slug: "nextarch",
  role: "owner",
};

async function mockApi(page) {
  await page.route("http://localhost:8080/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const responses = {
      "/api/v1/auth/me": {
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          email: "dj@example.com",
          displayName: "DJ Ang",
          isPlatformAdmin: true,
          teams: [team],
        },
      },
      "/api/v1/panel/overview": {
        data: {
          stats: {
            applications: 1,
            runningApplications: 1,
            nodes: 1,
            onlineNodes: 1,
            domains: 1,
            proxiedDomains: 1,
            deploymentsThisMonth: 2,
          },
          systemStatus: "operational",
        },
      },
      "/api/v1/panel/applications": {
        data: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "portal",
            domain: "portal.example.com",
            status: "Running",
            cpu: "2.0%",
            mem: "128 MB",
            deploy: new Date().toISOString(),
            color: "violet",
          },
        ],
      },
      "/api/v1/panel/nodes": {
        data: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "ams3-web-01",
            region: "Amsterdam",
            status: "online",
            memory: 42,
            disk: 30,
          },
        ],
      },
      "/api/v1/panel/deployments": { data: [] },
      "/api/v1/panel/notifications": { data: [], meta: { unread: 0 } },
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses[path] ?? { data: [] }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByText("Good afternoon, DJ")).toBeVisible();
});

test("desktop shell keeps navigation and footer visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop only");
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.getByRole("button", { name: "New application" })).toBeVisible();
  const overflow = await page
    .locator("body")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("mobile shell has no horizontal scrolling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile only");
  await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  const overflow = await page
    .locator("#root")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
