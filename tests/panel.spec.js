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
const nodeAgent = {
  nodeId: "66666666-6666-4666-8666-666666666666",
  token: "abcdefghijklmnopqrstuvwxyzABCDEFGH12345678",
  environment: {
    LH_API_URL: "https://api.legacyhosting.xyz/api/v1",
    LH_NODE_ID: "66666666-6666-4666-8666-666666666666",
    LH_AGENT_TOKEN: "abcdefghijklmnopqrstuvwxyzABCDEFGH12345678",
    LH_HEARTBEAT_INTERVAL_MS: "30000",
    LH_COMMAND_POLL_INTERVAL_MS: "2000",
  },
  installCommand:
    "curl -fsSL 'https://api.legacyhosting.xyz/api/v1/agent/install.sh' | sudo bash -s -- --api-url 'https://api.legacyhosting.xyz/api/v1' --node-id '66666666-6666-4666-8666-666666666666' --token 'abcdefghijklmnopqrstuvwxyzABCDEFGH12345678'",
};

async function mockApi(page, { isPlatformAdmin = true } = {}) {
  let teamName = team.name;
  let teams = [{ ...team }];
  let repositoryRefreshes = 0;
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
    if (path === "/api/v1/panel/nodes" && request.method() === "POST") {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { agent: nodeAgent } }),
      });
      return;
    }
    if (
      path === "/api/v1/integrations/github/repositories/refresh" &&
      request.method() === "POST"
    ) {
      repositoryRefreshes += 1;
      const repositories = [
        {
          id: "88888888-8888-4888-8888-888888888888",
          fullName: "NextarchStudio/Bifrost",
          metadata: { defaultBranch: "main", private: true },
        },
      ];
      if (repositoryRefreshes > 1)
        repositories.push({
          id: "77777777-8888-4888-8888-888888888888",
          fullName: "NextarchStudio/Vaktleder",
          metadata: { defaultBranch: "main", private: true },
        });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: repositories }),
      });
      return;
    }
    if (
      path === "/api/v1/panel/applications" &&
      request.method() === "POST"
    ) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: "77777777-7777-4777-8777-777777777777", status: "Pending" } }),
      });
      return;
    }
    if (
      path ===
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333" &&
      request.method() === "PATCH"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { updated: true } }),
      });
      return;
    }
    if (
      path ===
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333/persistent-files" &&
      request.method() === "POST"
    ) {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            commandId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            status: "queued",
          },
        }),
      });
      return;
    }
    if (
      path ===
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333/commands/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "succeeded", output: "Persistent file initialized" },
        }),
      });
      return;
    }
    if (
      path ===
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "33333333-3333-4333-8333-333333333333",
            name: "portal",
            hostname: "portal.example.com",
            repository: "NextarchStudio/Bifrost",
            branch: "main",
            autoDeploy: true,
            runtime: {
              install: { command: "pnpm", args: ["install", "--frozen-lockfile"] },
              build: { command: "pnpm", args: ["build"] },
              checks: [{ command: "pnpm", args: ["test"] }],
            },
            persistentPaths: [
              { type: "file", path: "V2/var/secrets/settings.key" },
            ],
            environment: [],
            processes: [],
            deployments: [],
            hostnames: [{ hostname: "portal.example.com", primary: true }],
            status: "running",
            proxyStatus: "active",
          },
        }),
      });
      return;
    }
    const responses = {
      "/api/v1/auth/me": {
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          email: "dj@example.com",
          displayName: "DJ Ang",
          isPlatformAdmin,
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
      "/api/v1/panel/application-targets": {
        data: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            region: "Amsterdam, NL",
          },
        ],
      },
      "/api/v1/integrations/github/repositories": {
        data: [
          {
            id: "88888888-8888-4888-8888-888888888888",
            fullName: "NextarchStudio/Bifrost",
            metadata: { defaultBranch: "main", private: true },
          },
        ],
      },
      "/api/v1/integrations/cloudflare/zones": {
        data: [
          { id: "99999999-9999-4999-8999-999999999999", name: "legacyh.dev" },
          { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "tg.no" },
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

test.beforeEach(async ({ page }, testInfo) => {
  await mockApi(page, {
    isPlatformAdmin: !testInfo.title.startsWith("customer accounts"),
  });
  await page.goto("/");
  await expect(page.getByText(/Good (morning|afternoon|evening), DJ/)).toBeVisible();
});

test("desktop shell keeps navigation and footer visible", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop only");
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  await expect(page.getByText(/LH-Panel v1\.0\.\d+/)).toBeVisible();
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

test("application settings can be edited from the overview", async ({ page }) => {
  const editButton = page.getByRole("button", { name: "Edit portal" });
  const deleteButton = page.getByRole("button", { name: "Delete application" });
  const [editBox, deleteBox] = await Promise.all([
    editButton.boundingBox(),
    deleteButton.boundingBox(),
  ]);
  expect(editBox).not.toBeNull();
  expect(deleteBox).not.toBeNull();
  expect(Math.abs(editBox.y - deleteBox.y)).toBeLessThanOrEqual(1);

  await editButton.click();
  const dialog = page.getByRole("dialog", { name: "Edit application" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Application name")).toHaveValue("portal");
  await expect(dialog.getByLabel("Branch")).toHaveValue("main");
  await expect(dialog.getByLabel("Install command")).toHaveValue(
    "pnpm install --frozen-lockfile",
  );

  await dialog.getByLabel("Application name").fill("portal-next");
  await dialog.getByLabel("Branch").fill("production");
  const updateRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname ===
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333" &&
      request.method() === "PATCH",
  );
  await dialog.getByRole("button", { name: "Save changes" }).click();
  const payload = (await updateRequest).postDataJSON();

  expect(payload).toMatchObject({
    name: "portal-next",
    branch: "production",
    autoDeploy: true,
    installCommand: {
      command: "pnpm",
      args: ["install", "--frozen-lockfile"],
    },
    persistentPaths: [
      { type: "file", path: "V2/var/secrets/settings.key" },
    ],
  });
  await expect(
    page.getByRole("status").filter({ hasText: "portal-next was updated" }),
  ).toBeVisible();
});

test("persistent secret files can be initialized without returning their value", async ({
  page,
}) => {
  await page.getByRole("link", { name: /portal/ }).first().click();
  await page.getByRole("button", { name: "Initialize file" }).click();
  const dialog = page.getByRole("dialog", { name: "Initialize secret file" });
  await expect(dialog).toBeVisible();
  const secret = "replacement-secret-key";
  await dialog.getByLabel("Secret file content").fill(secret);

  const writeRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname.endsWith("/persistent-files") &&
      request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Initialize file" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(
    confirmation.getByRole("heading", {
      name: "Replace V2/var/secrets/settings.key?",
    }),
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "Replace and restart" }).click();
  const payload = (await writeRequest).postDataJSON();

  expect(payload).toEqual({
    path: "V2/var/secrets/settings.key",
    content: secret,
    restartProcesses: true,
  });
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Secret file updated and application processes restarted" }),
  ).toBeVisible();
});

test("notification menu closes after outside clicks and navigation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop only");

  const trigger = page.getByTitle("Notifications");
  const popover = page.getByRole("dialog", { name: "Notifications" });

  await trigger.click();
  await expect(popover).toBeVisible();
  await page.getByRole("heading", { name: /Good (morning|afternoon|evening), DJ/ }).click();
  await expect(popover).toBeHidden();

  await trigger.click();
  await expect(popover).toBeVisible();
  await page.getByRole("link", { name: "Domains" }).click();
  await expect(page).toHaveURL(/\/domains$/);
  await expect(popover).toBeHidden();
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
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/nodes$/);
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

  await page.getByRole("button", { name: "Auto deploy" }).click();
  const dialog = page.getByRole("dialog", { name: "Auto deploy command" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(nodeAgent.installCommand)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Docker/ })).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Copy auto deploy command" }),
  ).toBeVisible();
  const dialogOverflow = await dialog.evaluate(
    (element) => element.scrollWidth - element.clientWidth,
  );
  expect(dialogOverflow).toBeLessThanOrEqual(1);
});

test("multiple PM2 processes never submit customer-selected ports", async ({ page }) => {
  await page.getByRole("button", { name: "New application" }).click();
  const dialog = page.getByRole("dialog", { name: "New application" });
  await dialog.getByLabel("Application name").fill("bifrost");
  await dialog.getByLabel("Hostname", { exact: true }).fill("tg");
  await dialog.getByLabel("GitHub repository").selectOption("NextarchStudio/Bifrost");
  await dialog.getByLabel("Process setup").selectOption("multiple");
  await dialog.getByRole("textbox", { name: /^Additional hostnames/ }).fill("bifrost.tg.no");

  const createRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/v1/panel/applications" &&
      request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Create application" }).click();
  const payload = (await createRequest).postDataJSON();

  expect(payload.nodeId).toBe("44444444-4444-4444-8444-444444444444");
  expect(payload.domain).toBe("tg.legacyh.dev");
  expect(payload.additionalHostnames).toEqual(["bifrost.tg.no"]);
  expect(payload.processes.map((process) => process.type)).toEqual([
    "web",
    "api",
    "worker",
  ]);
  expect(JSON.stringify(payload)).not.toContain("internalPort");
  expect(payload.environment.PORT).toBeUndefined();
  expect(payload.processes.every((process) => process.environment.PORT === undefined)).toBe(true);
});

test("new application refreshes GitHub repositories and uses the zone for an empty hostname", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New application" }).click();
  let dialog = page.getByRole("dialog", { name: "New application" });
  const repository = dialog.getByLabel("GitHub repository");
  await expect(repository).toBeEnabled();
  await expect(
    repository.locator('option[value="NextarchStudio/Vaktleder"]'),
  ).toHaveCount(0);

  await dialog.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "New application" }).click();
  dialog = page.getByRole("dialog", { name: "New application" });
  const refreshedRepository = dialog.getByLabel("GitHub repository");
  await expect(refreshedRepository).toBeEnabled();
  await expect(
    refreshedRepository.locator('option[value="NextarchStudio/Vaktleder"]'),
  ).toHaveCount(1);

  await dialog.getByLabel("Application name").fill("vaktleder");
  await refreshedRepository.selectOption("NextarchStudio/Vaktleder");
  await expect(dialog.getByLabel("Hostname", { exact: true })).toHaveValue("");
  const createRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/v1/panel/applications" &&
      request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Create application" }).click();
  expect((await createRequest).postDataJSON().domain).toBe("legacyh.dev");
});

test("customer accounts cannot access internal node administration", async ({ page }) => {
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(page.getByText("Node health")).toHaveCount(0);

  await page.goto("/admin/nodes");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Good (morning|afternoon|evening), DJ/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nodes", exact: true })).toHaveCount(0);
});

test("overview keeps node infrastructure inside administration", async ({ page }) => {
  await expect(page.getByText("Node health")).toHaveCount(0);
  await expect(page.getByText("View nodes")).toHaveCount(0);
  await expect(page.getByText("Monitor deployments, nodes, and domains from one place.")).toHaveCount(0);
});
