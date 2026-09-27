import { expect, test } from "@playwright/test";

const apiRoute = "**/api/v1/**";

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
const customerTeam = {
  id: "12121212-1212-4212-8212-121212121212",
  name: "Customer Workspace",
  slug: "customer-workspace",
  role: "owner",
};
const customerUser = {
  id: "13131313-1313-4313-8313-131313131313",
  email: "customer@example.com",
  displayName: "Customer User",
  status: "active",
  isPlatformAdmin: false,
  createdAt: "2026-09-19T10:00:00.000Z",
  teams: [customerTeam],
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

function logLines(prefix, count) {
  return Array.from(
    { length: count },
    (_value, index) => `${prefix} ${index + 1}`,
  ).join("\n");
}

async function mockApi(page, { isPlatformAdmin = true } = {}) {
  let teamName = team.name;
  let teams = [{ ...team }];
  let repositoryRefreshes = 0;
  let buildLogRequests = 0;
  let runtimeLogRequests = 0;
  let applicationDeleted = false;
  let applicationStatus = "running";
  let processStatus = "online";
  let applicationUpdatedAt = "2026-09-18T10:00:00.000Z";
  let processRecordedAt = "2026-09-18T10:00:00.000Z";
  let lifecycleCommand = null;
  let lifecycleCommandReads = 0;
  let cloudflareConnected = true;
  let githubUserConnected = true;
  await page.route(apiRoute, async (route) => {
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
      if (request.headers()["x-support-user-id"] === customerUser.id) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: [
              {
                id: "14141414-1414-4414-8414-141414141414",
                fullName: "CustomerOrg/Website",
                metadata: { defaultBranch: "main", private: true },
              },
            ],
          }),
        });
        return;
      }
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
      path ===
        "/api/v1/integrations/cloudflare/15151515-1515-4515-8515-151515151515" &&
      request.method() === "DELETE"
    ) {
      cloudflareConnected = false;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (
      path === "/api/v1/integrations/github/connect" &&
      request.method() === "POST"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            authorizationUrl:
              "https://github.com/login/oauth/authorize?client_id=Iv1.test&state=test-state",
          },
        }),
      });
      return;
    }
    if (
      path === "/api/v1/integrations/github/user" &&
      request.method() === "DELETE"
    ) {
      githubUserConnected = false;
      await route.fulfill({ status: 204, body: "" });
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
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333" &&
      request.method() === "DELETE"
    ) {
      applicationDeleted = true;
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            commandId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            status: "queued",
          },
        }),
      });
      return;
    }
    if (
      path ===
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333/commands/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { status: "succeeded", output: "Application removed" },
        }),
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
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333/logs" &&
      request.method() === "POST"
    ) {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            commandId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            status: "queued",
          },
        }),
      });
      return;
    }
    const lifecycleAction = path.match(
      /^\/api\/v1\/panel\/applications\/33333333-3333-4333-8333-333333333333\/actions\/(deploy|start|stop|restart)$/,
    );
    if (lifecycleAction && request.method() === "POST") {
      lifecycleCommand = lifecycleAction[1];
      lifecycleCommandReads = 0;
      if (lifecycleCommand === "deploy") applicationStatus = "deploying";
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            commandId: "99999999-9999-4999-8999-999999999999",
            status: "queued",
          },
        }),
      });
      return;
    }
    if (
      path ===
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333/commands/99999999-9999-4999-8999-999999999999" &&
      request.method() === "GET"
    ) {
      lifecycleCommandReads += 1;
      const running = lifecycleCommandReads === 1;
      const finishedAt = new Date().toISOString();
      if (!running) {
        applicationStatus = lifecycleCommand === "stop" ? "stopped" : "running";
        processStatus = lifecycleCommand === "stop" ? "stopped" : "online";
        applicationUpdatedAt = finishedAt;
        processRecordedAt = finishedAt;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            status: running ? "leased" : "succeeded",
            output: running ? `${lifecycleCommand} in progress` : `${lifecycleCommand} complete`,
            finishedAt: running ? null : finishedAt,
          },
        }),
      });
      return;
    }
    if (
      path ===
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333/commands/ffffffff-ffff-4fff-8fff-ffffffffffff" &&
      request.method() === "GET"
    ) {
      runtimeLogRequests += 1;
      const running = runtimeLogRequests === 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            status: running ? "leased" : "succeeded",
            output: running
              ? logLines("runtime line", 70)
              : `${logLines("runtime line", 110)}\nlatest runtime line`,
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
        "/api/v1/panel/applications/33333333-3333-4333-8333-333333333333/commands/cccccccc-cccc-4ccc-8ccc-cccccccccccc" &&
      request.method() === "GET"
    ) {
      buildLogRequests += 1;
      const running = buildLogRequests === 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            status: running ? "leased" : "failed",
            output: running
              ? `> pnpm install\n${logLines("install line", 70)}\nResolving packages…`
              : `> pnpm build\n${logLines("build line", 110)}\nTypeScript error: Property 'name' does not exist\nELIFECYCLE Command failed with exit code 2`,
            startedAt: "2026-09-18T10:00:00.000Z",
            finishedAt: running ? null : "2026-09-18T10:00:08.000Z",
            cancelRequestedAt: null,
          },
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
            processes: [
              {
                id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
                name: "web",
                type: "web",
                workingDirectory: ".",
                executable: "pnpm",
                arguments: ["start"],
                primary: true,
                public: true,
                routes: ["/"],
                hostname: "portal.example.com",
                enabled: true,
                startOrder: 0,
                instances: 1,
                restartDelayMs: 1000,
                inheritEnvironment: true,
                healthPath: "/health",
                hostVariable: "PORTAL_HOST",
                portVariable: "PORTAL_PORT",
                environmentKeys: ["DATABASE_URL"],
                status: processStatus,
                recordedAt: processRecordedAt,
              },
            ],
            deployments: [],
            hostnames: [{ hostname: "portal.example.com", primary: true }],
            status: applicationStatus,
            updatedAt: applicationUpdatedAt,
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
      "/api/v1/auth/admin/users": {
        data: [
          customerUser,
          {
            id: "22222222-2222-4222-8222-222222222222",
            email: "dj@example.com",
            displayName: "DJ Ang",
            status: "active",
            isPlatformAdmin: true,
            createdAt: "2026-09-18T10:00:00.000Z",
            teams: [team],
          },
        ],
      },
      "/api/v1/panel/overview": {
        data: {
          stats: {
            applications: 1,
            runningApplications: applicationStatus === "running" ? 1 : 0,
            nodes: 1,
            onlineNodes: 1,
            domains: 1,
            proxiedDomains: 1,
            deploymentsThisMonth: 2,
          },
          systemStatus: applicationStatus === "running" ? "operational" : "degraded",
        },
      },
      "/api/v1/panel/applications": {
        data: applicationDeleted ? [] : [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "portal",
            domain: "portal.example.com",
            status: `${applicationStatus.charAt(0).toUpperCase()}${applicationStatus.slice(1)}`,
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
        data:
          request.headers()["x-support-user-id"] === customerUser.id
            ? [
                {
                  id: "17171717-1717-4717-8717-171717171717",
                  name: "customer.example",
                },
              ]
            : [
                {
                  id: "99999999-9999-4999-8999-999999999999",
                  name: "legacyh.dev",
                },
                {
                  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  name: "tg.no",
                },
              ],
      },
      "/api/v1/integrations/cloudflare": {
        data: cloudflareConnected
          ? [
              {
                id: "15151515-1515-4515-8515-151515151515",
                displayName: "Cloudflare Account",
                zones: 2,
              },
            ]
          : [],
      },
      "/api/v1/integrations/github": {
        data: [
          {
            id: "16161616-1616-4616-8616-161616161616",
            installationId: "12345678",
            displayName: "NextarchStudio",
            accountType: "Organization",
            repositories: 12,
          },
          {
            id: "17171717-1717-4717-8717-171717171717",
            installationId: "23456789",
            displayName: "LegacyAngel2K9",
            accountType: "User",
            repositories: 4,
          },
        ],
        meta: {
          installationUrl:
            "https://github.com/apps/legacy-hosting-deployments/installations/new",
          userConnection: githubUserConnected
            ? {
                id: "18181818-1818-4818-8818-181818181818",
                githubLogin: "LegacyAngel2K9",
                repositories: 7,
              }
            : null,
        },
      },
      "/api/v1/panel/deployments": {
        data: [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            applicationId: "33333333-3333-4333-8333-333333333333",
            applicationName: "portal",
            commandId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            commitSha: "1a2b3c4d5e6f7890",
            source: "manual",
            status: "building",
            createdAt: "2026-09-18T10:00:00.000Z",
          },
        ],
      },
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

test("deployment history shows captured build output", async ({ page }) => {
  await page.context().grantPermissions(
    ["clipboard-read", "clipboard-write"],
    { origin: "http://127.0.0.1:4173" },
  );
  await page.getByRole("link", { name: "Deployments" }).click();
  await expect(page).toHaveURL(/\/deployments$/);
  await page.getByRole("button", { name: "Show build logs for portal" }).click();

  const logs = page.getByRole("region", { name: "Build logs for portal" });
  await expect(logs).toBeVisible();
  await expect(logs.getByText("Resolving packages…")).toBeVisible();
  await expect(logs.getByText("TypeScript error: Property 'name' does not exist")).toBeVisible();
  await expect(logs.getByText("ELIFECYCLE Command failed with exit code 2")).toBeVisible();
  await expect(logs.locator(".deployment-build-log-head p")).toContainText("Failed");
  const viewer = logs.getByLabel("Build log output for portal");
  await expect
    .poll(() =>
      viewer.evaluate(
        (element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
  await logs.getByRole("button", { name: "Copy logs" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Build logs copied" }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "ELIFECYCLE Command failed with exit code 2",
  );
});

test("runtime logs follow new lines and copy the complete output", async ({
  page,
}) => {
  await page.context().grantPermissions(
    ["clipboard-read", "clipboard-write"],
    { origin: "http://127.0.0.1:4173" },
  );
  await page.getByRole("link", { name: /portal/ }).first().click();
  await page.getByRole("button", { name: "Refresh logs" }).click();

  const viewer = page.getByLabel("Runtime log output");
  await expect(viewer).toContainText("latest runtime line");
  await expect
    .poll(() =>
      viewer.evaluate(
        (element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Copy logs" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Runtime logs copied" }),
  ).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain("runtime line 1");
  expect(clipboard).toContain("latest runtime line");
});

test("application and system status update while lifecycle commands run", async ({
  page,
}) => {
  await page.getByRole("link", { name: /portal/ }).first().click();
  const processStatus = page.locator(".process-runtime-status");
  const systemStatus = page.locator("header .status");

  await expect(processStatus).toContainText(/online/i);
  await expect(systemStatus).toContainText("All systems operational");

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(processStatus).toContainText(/stopping/i);
  await expect(processStatus).toContainText(/stopped/i, { timeout: 10_000 });
  await expect(systemStatus).toContainText("Some systems need attention");

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(processStatus).toContainText(/starting/i);
  await expect(processStatus).toContainText(/online/i, { timeout: 10_000 });
  await expect(systemStatus).toContainText("All systems operational");
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
  const processCard = dialog.locator(".process-card").first();
  await expect(processCard.getByLabel("Process name")).toHaveValue("web");
  await expect(processCard.getByText("Stored keys: DATABASE_URL")).toBeVisible();

  await dialog.getByLabel("Application name").fill("portal-next");
  await dialog.getByLabel("Branch").fill("production");
  await processCard.getByLabel("Process name").fill("portal-web");
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
    processes: [
      {
        id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        name: "portal-web",
        type: "web",
        primary: true,
        public: true,
        routes: ["/"],
      },
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

test("application deletion completes and removes the application", async ({
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
  await expect
    .poll(async () => {
      const settledBox = await dialog.boundingBox();
      return settledBox
        ? Math.abs(settledBox.x + settledBox.width / 2 - viewport.width / 2)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(3);
  await expect
    .poll(async () => {
      const settledBox = await dialog.boundingBox();
      return settledBox
        ? Math.abs(settledBox.y + settledBox.height / 2 - viewport.height / 2)
        : Number.POSITIVE_INFINITY;
    })
    .toBeLessThan(3);

  await dialog.getByRole("button", { name: "Delete application" }).click();
  const toast = page
    .getByRole("status")
    .filter({ hasText: "portal was deleted" });
  await expect(toast).toBeVisible();
  await expect(
    page.getByText("No applications have been created yet."),
  ).toBeVisible();
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

test("workspace connections can be disconnected from settings", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("Cloudflare Account")).toBeVisible();
  await expect(page.getByText("NextarchStudio", { exact: true })).toBeVisible();

  const cloudflareRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname ===
        "/api/v1/integrations/cloudflare/15151515-1515-4515-8515-151515151515" &&
      request.method() === "DELETE",
  );
  await page
    .getByRole("button", { name: "Disconnect Cloudflare Cloudflare Account" })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await cloudflareRequest;
  await expect(page.getByText("No Cloudflare account connected.")).toBeVisible();

  const githubRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/v1/integrations/github/user" &&
      request.method() === "DELETE",
  );
  await page
    .getByRole("button", { name: "Disconnect GitHub account LegacyAngel2K9" })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await githubRequest;
  await expect(page.getByText("No GitHub user authorized.")).toBeVisible();
  await expect(
    page.getByText("Connect your GitHub account to discover available installations."),
  ).toBeVisible();
});

test("GitHub connection uses user authorization instead of installation update", async ({
  page,
}) => {
  await page.route(
    "https://github.com/login/oauth/authorize**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>GitHub user authorization</h1>",
      });
    },
  );
  await page.getByRole("link", { name: "Settings" }).click();
  const grantAccess = page.getByRole("link", {
    name: "Grant repository access",
  });
  await expect(grantAccess).toHaveAttribute(
    "href",
    "https://github.com/apps/legacy-hosting-deployments/installations/new",
  );
  expect(await grantAccess.getAttribute("href")).not.toContain(
    "setup_action=update",
  );
  await page.getByRole("button", { name: "Reconnect GitHub account" }).click();
  await expect(
    page.getByRole("heading", { name: "GitHub user authorization" }),
  ).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login/oauth/authorize");
  expect(url.searchParams.has("setup_action")).toBe(false);
  expect(page.url()).not.toContain("installations/new");
});

test("administrators can support a customer and create an application in their workspace", async ({
  page,
}) => {
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.getByRole("link", { name: "Users", exact: true }).click();
  await expect(page.getByText(customerUser.email)).toBeVisible();

  const supportOverview = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/v1/panel/overview" &&
      request.headers()["x-support-user-id"] === customerUser.id &&
      request.headers()["x-team-id"] === customerTeam.id,
  );
  await page
    .getByRole("button", { name: "View customer panel", exact: true })
    .first()
    .click();
  await supportOverview;

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Good (morning|afternoon|evening), Customer/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  await expect(
    page.locator('.workspace[aria-label^="Switch team"]:visible'),
  ).toHaveAttribute(
    "aria-label",
    `Switch team. Current team: ${customerTeam.name}`,
  );

  const customerRepositories = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname ===
        "/api/v1/integrations/github/repositories/refresh" &&
      request.headers()["x-support-user-id"] === customerUser.id &&
      request.headers()["x-team-id"] === customerTeam.id,
  );
  await page.getByRole("button", { name: "New application" }).click();
  await customerRepositories;
  const dialog = page.getByRole("dialog", { name: "New application" });
  await expect(
    dialog.getByLabel("GitHub repository").locator('option[value="CustomerOrg/Website"]'),
  ).toHaveCount(1);
  await expect(
    dialog.locator(".form-grid").first().locator("select").nth(1),
  ).toHaveValue("customer.example");

  await dialog.getByLabel("Application name").fill("customer-site");
  await dialog.getByLabel("GitHub repository").selectOption("CustomerOrg/Website");
  const createRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/v1/panel/applications" &&
      request.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Create application" }).click();
  const created = await createRequest;
  expect(created.headers()["x-support-user-id"]).toBe(customerUser.id);
  expect(created.headers()["x-team-id"]).toBe(customerTeam.id);
  expect(created.postDataJSON()).toMatchObject({
    name: "customer-site",
    rootDomain: "customer.example",
    domain: "customer.example",
    repository: "CustomerOrg/Website",
  });

  const adminUsers = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === "/api/v1/auth/admin/users" &&
      !request.headers()["x-support-user-id"],
  );
  await page.getByTitle("Return to administrator account").click();
  await adminUsers;
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
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
  const botName = dialog.getByLabel("Process name").nth(2);
  await botName.fill("");
  await botName.pressSequentially("discord-bot");
  await expect(botName).toHaveValue("discord-bot");
  await dialog.getByLabel("Type").nth(2).selectOption("bot");
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
    "bot",
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
