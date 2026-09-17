import { expect, test } from "@playwright/test";

const team = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Nextarch Studio",
  slug: "nextarch",
  role: "owner",
};
const createdTeam = {
  id: "55555555-5555-4555-8555-555555555555",
  name: "Legacy Hosting Apps",
  slug: "legacy-hosting-apps-1234abcd",
  role: "owner",
};

async function mockApi(page) {
  let teamName = team.name;
  let teams = [{ ...team }];
  await page.route("http://localhost:8080/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (
      path === `/api/v1/teams/${team.id}` &&
      request.method() === "PATCH"
    ) {
      teamName = request.postDataJSON().name;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: team.id, name: teamName } }),
      });
      return;
    }
    if (path === "/api/v1/teams" && request.method() === "POST") {
      const newTeam = { ...createdTeam, name: request.postDataJSON().name };
      teams = [...teams, newTeam];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: newTeam }),
      });
      return;
    }
    const responses = {
      "/api/v1/auth/me": {
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          email: "dj@example.com",
          displayName: "DJ Ang",
          isPlatformAdmin: true,
          teams: teams.map((item) =>
            item.id === team.id ? { ...item, name: teamName } : item,
          ),
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
            publicFqdn: "ams3.web-01.legacyh.fyi",
            publicIpv4: "203.0.113.10",
            publicIpv6: "2001:db8::10",
            privateFqdn: "ams3.web-01.internal.legacyh.fyi",
            privateIpv4: "10.0.0.10",
            privateIpv6: "fd00::10",
            cnameTarget: "ams3.web-01.legacyh.fyi",
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
  await expect(page.getByText("LH-Panel v1.0.7")).toBeVisible();
  await expect(page.getByRole("button", { name: "New application" })).toBeVisible();
  const overflow = await page
    .locator("body")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("mobile shell has no horizontal scrolling", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile only");
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  const overflow = await page
    .locator("#root")
    .evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("navigation keeps its page URL after a reload", async ({ page }) => {
  await page.getByRole("link", { name: "Domains" }).click();
  await expect(page).toHaveURL(/\/domains$/);
  await expect(
    page.getByRole("heading", { name: "Domains", exact: true }).first(),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/domains$/);
  await expect(
    page.getByRole("heading", { name: "Domains", exact: true }).first(),
  ).toBeVisible();
});

test("logout sends a bodyless request without a JSON content type", async ({
  page,
}) => {
  const logoutRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/v1/auth/logout" &&
      request.method() === "POST",
  );

  await page.locator('button[title="Sign out"]:visible').click();
  const request = await logoutRequest;

  expect(request.headers()["content-type"]).toBeUndefined();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("destructive actions use a centered confirmation and a toast", async ({
  page,
}) => {
  await page.getByTitle("Delete application").click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Delete portal?" })).toBeVisible();

  const dialogBox = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(dialogBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThan(3);
  expect(Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2)).toBeLessThan(3);

  await dialog.getByRole("button", { name: "Delete application" }).click();
  const toast = page
    .getByRole("status")
    .filter({ hasText: "portal deletion queued" });
  await expect(toast).toBeVisible();
  const toastBox = await toast.boundingBox();
  const expectedBottom = viewport.width <= 720 ? 112 : 66;
  expect(toastBox).not.toBeNull();
  expect(viewport.width - toastBox.x - toastBox.width).toBeLessThanOrEqual(18);
  expect(
    Math.abs(viewport.height - toastBox.y - toastBox.height - expectedBottom),
  ).toBeLessThan(3);
});

test("team administrators can rename their workspace", async ({ page }) => {
  await page.getByRole("link", { name: "Team" }).click();
  await expect(page).toHaveURL(/\/team$/);

  await page.getByRole("textbox", { name: "Team name" }).fill("Legacy Hosting");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Team renamed to Legacy Hosting" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Legacy Hosting", exact: true }).first(),
  ).toBeVisible();
});

test("users can create and switch between teams", async ({ page }) => {
  const switcher = page.locator('.workspace[aria-label^="Switch team"]:visible');
  await switcher.click();
  await page.getByRole("menu").getByRole("button", { name: "Create team" }).click();

  const dialog = page.getByRole("dialog", { name: "Create a new team" });
  await dialog.getByRole("textbox", { name: "Team name" }).fill(createdTeam.name);
  const teamDataRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/v1/panel/overview" &&
      request.headers()["x-team-id"] === createdTeam.id,
  );
  await dialog
    .getByRole("button", { name: "Create team", exact: true })
    .click();
  await teamDataRequest;

  await expect(
    page.getByRole("status").filter({ hasText: `${createdTeam.name} was created` }),
  ).toBeVisible();
  await expect(switcher).toHaveAttribute(
    "aria-label",
    `Switch team. Current team: ${createdTeam.name}`,
  );
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("lh_active_team")))
    .toBe(createdTeam.id);

  await switcher.click();
  await page.getByRole("menu").getByRole("menuitem", { name: /Nextarch Studio/ }).click();
  await expect(switcher).toHaveAttribute(
    "aria-label",
    `Switch team. Current team: ${team.name}`,
  );
});

test("nodes accept public and private FQDN, IPv4, and IPv6", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Nodes", exact: true }).click();
  await page.getByRole("button", { name: "Add node" }).click();

  await page.getByLabel("Node name").fill("ams3-web-02");
  await page.getByLabel("Region").fill("Amsterdam, NL");
  await page
    .getByLabel("Public FQDN")
    .fill("ams3.web-02.legacyh.fyi");
  await page.getByLabel("Public IPv4", { exact: true }).fill("203.0.113.20");
  await page.getByLabel("Public IPv6", { exact: true }).fill("2001:db8::20");
  await page
    .getByLabel("Private FQDN (optional)")
    .fill("ams3.web-02.internal.legacyh.fyi");
  await page
    .getByLabel("Private IPv4 (optional)")
    .fill("10.0.0.20");
  await page.getByLabel("Private IPv6 (optional)").fill("fd00::20");

  const createRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/v1/panel/nodes" &&
      request.method() === "POST",
  );
  await page.getByRole("button", { name: "Create node" }).click();
  const payload = (await createRequest).postDataJSON();

  expect(payload).toMatchObject({
    publicFqdn: "ams3.web-02.legacyh.fyi",
    publicIpv4: "203.0.113.20",
    publicIpv6: "2001:db8::20",
    privateFqdn: "ams3.web-02.internal.legacyh.fyi",
    privateIpv4: "10.0.0.20",
    privateIpv6: "fd00::20",
    cnameTarget: "ams3.web-02.legacyh.fyi",
  });
  await expect(
    page.getByRole("status").filter({ hasText: "ams3-web-02 was created" }),
  ).toBeVisible();
});
