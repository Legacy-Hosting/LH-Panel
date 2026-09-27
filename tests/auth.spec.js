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

test("the login screen starts SSO through the API", async ({ page }) => {
  await page.unroute("http://localhost:8080/api/v1/**");
  await page.route("http://localhost:8080/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/me") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "authentication_required" }),
      });
      return;
    }
    if (url.pathname === "/api/v1/auth/registration") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { bootstrapRequired: false, mode: "closed" },
        }),
      });
      return;
    }
    if (url.pathname === "/api/v1/auth/oidc/start") {
      expect(url.searchParams.get("return_to")).toBe("/");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            authorizationUrl: "http://localhost:8081/auth?state=test-state",
            expiresIn: 600,
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
  await page.route("http://localhost:8081/auth?state=test-state", async (route) => {
    await route.fulfill({ status: 204 });
  });

  await page.goto("/");
  const authorization = page.waitForRequest(
    "http://localhost:8081/auth?state=test-state",
  );
  await page.getByRole("button", { name: /Continue with Legacy Hosting SSO/ }).click();
  await authorization;
});

test("an authenticated legacy session completes an SSO interaction with a form POST", async ({
  page,
}) => {
  const interactionUid = "interaction_uid_123456";
  await page.unroute("http://localhost:8080/api/v1/**");
  await page.route("http://localhost:8080/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "123e4567-e89b-12d3-a456-426614174000",
            email: "user@example.com",
            displayName: "Example User",
            isPlatformAdmin: false,
            teams: [],
          },
        }),
      });
      return;
    }
    if (path === "/api/v1/auth/csrf") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { token: "c".repeat(64) } }),
      });
      return;
    }
    if (path === "/api/v1/auth/sso/continue") {
      expect(route.request().postDataJSON()).toEqual({ interactionUid });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            ticket: "t".repeat(43),
            expiresIn: 60,
            completionUri: `http://localhost:8081/interaction/${interactionUid}/complete`,
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
  await page.route(
    `http://localhost:8081/interaction/${interactionUid}/complete`,
    async (route) => route.fulfill({ status: 204 }),
  );

  const completion = page.waitForRequest(
    (request) => request.url().endsWith(`/interaction/${interactionUid}/complete`),
  );
  await page.goto(`/?sso_interaction=${interactionUid}`, { waitUntil: "commit" });
  const request = await completion;
  expect(request.method()).toBe("POST");
  expect(request.postData()).toBe(`ticket=${"t".repeat(43)}`);
});
