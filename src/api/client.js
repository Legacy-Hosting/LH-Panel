const API_ROOT = (
  import.meta.env.VITE_API_URL || "http://localhost:8080/api/v1"
).replace(/\/$/, "");

let csrfToken = "";

const fieldLabels = {
  name: "Name",
  publicFqdn: "Public FQDN",
  publicIpv4: "Public IPv4",
  publicIpv6: "Public IPv6",
  privateFqdn: "Private FQDN",
  privateIpv4: "Private IPv4",
  privateIpv6: "Private IPv6",
  cnameTarget: "CNAME target",
  region: "Region",
};

function errorMessage(payload, status) {
  const fieldErrors = payload.details?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === "object") {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (Array.isArray(messages) && messages[0]) {
        return `${fieldLabels[field] || field}: ${messages[0]}`;
      }
    }
  }
  const formError = payload.details?.formErrors?.[0];
  if (formError) return formError;
  return (
    payload.message ||
    payload.error ||
    `Request failed with status ${status}`
  );
}

async function csrf() {
  if (csrfToken) return csrfToken;
  const response = await fetch(`${API_ROOT}/auth/csrf`, {
    credentials: "include",
  });
  if (!response.ok) return "";
  const payload = await response.json();
  csrfToken = payload.data?.token || "";
  return csrfToken;
}

async function request(path, options = {}) {
  const { headers: optionHeaders, ...requestOptions } = options;
  const teamId = window.localStorage.getItem("lh_active_team");
  const method = (requestOptions.method || "GET").toUpperCase();
  const hasBody = requestOptions.body !== undefined && requestOptions.body !== null;
  const unauthenticatedAuth = [
    "/auth/register/options",
    "/auth/register/verify",
    "/auth/login/options",
    "/auth/login/verify",
  ].includes(path);
  const requestCsrfToken =
    !["GET", "HEAD", "OPTIONS"].includes(method) && !unauthenticatedAuth
      ? await csrf()
      : "";
  const response = await fetch(`${API_ROOT}${path}`, {
    credentials: "include",
    ...requestOptions,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(teamId ? { "X-Team-ID": teamId } : {}),
      ...(requestCsrfToken ? { "X-CSRF-Token": requestCsrfToken } : {}),
      ...optionHeaders,
    },
  });

  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    const error = new Error(errorMessage(payload, response.status));
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

async function stream(path, onEvent, signal) {
  const teamId = window.localStorage.getItem("lh_active_team");
  const response = await fetch(`${API_ROOT}${path}`, {
    credentials: "include",
    headers: teamId ? { "X-Team-ID": teamId } : {},
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error(`Stream request failed with status ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data));
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export const panelApi = {
  selectTeam: (teamId) => window.localStorage.setItem("lh_active_team", teamId),
  registrationStatus: () => request("/auth/registration"),
  me: () => request("/auth/me"),
  registrationOptions: (body) =>
    request("/auth/register/options", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyRegistration: (body) =>
    request("/auth/register/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  authenticationOptions: (body) =>
    request("/auth/login/options", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verifyAuthentication: (body) =>
    request("/auth/login/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  logout: async () => {
    const response = await request("/auth/logout", { method: "POST" });
    csrfToken = "";
    return response;
  },
  registrationSettings: () => request("/auth/admin/registration"),
  updateRegistrationSettings: (body) =>
    request("/auth/admin/registration", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  teams: () => request("/teams"),
  createTeam: (body) =>
    request("/teams", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTeam: (teamId, body) =>
    request(`/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  acceptInvitation: (token) =>
    request("/teams/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  teamMembers: (teamId) => request(`/teams/${teamId}/members`),
  teamInvitations: (teamId) => request(`/teams/${teamId}/invitations`),
  createInvitation: (teamId, body) =>
    request(`/teams/${teamId}/invitations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  cloudflareConnections: () => request("/integrations/cloudflare"),
  cloudflareZones: () => request("/integrations/cloudflare/zones"),
  cloudflareConnect: (returnPath = "/settings/integrations") =>
    request("/integrations/cloudflare/connect", {
      method: "POST",
      body: JSON.stringify({ returnPath }),
    }),
  githubConnections: () => request("/integrations/github"),
  githubRepositories: () => request("/integrations/github/repositories"),
  githubConnect: (returnPath = "/settings/integrations") =>
    request("/integrations/github/connect", {
      method: "POST",
      body: JSON.stringify({ returnPath }),
    }),
  overview: () => request("/panel/overview"),
  applications: () => request("/panel/applications"),
  application: (applicationId) =>
    request(`/panel/applications/${applicationId}`),
  createApplication: (body) =>
    request("/panel/applications", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  applicationAction: (applicationId, action) =>
    request(`/panel/applications/${applicationId}/actions/${action}`, {
      method: "POST",
    }),
  applicationLogs: (applicationId, lines = 200) =>
    request(`/panel/applications/${applicationId}/logs`, {
      method: "POST",
      body: JSON.stringify({ lines }),
    }),
  applicationCommand: (applicationId, commandId) =>
    request(`/panel/applications/${applicationId}/commands/${commandId}`),
  streamApplicationCommand: (applicationId, commandId, onEvent, signal) =>
    stream(
      `/panel/applications/${applicationId}/commands/${commandId}/events`,
      onEvent,
      signal,
    ),
  rollbackApplication: (applicationId, deploymentId) =>
    request(
      `/panel/applications/${applicationId}/deployments/${deploymentId}/rollback`,
      { method: "POST" },
    ),
  saveEnvironmentVariable: (applicationId, key, value) =>
    request(
      `/panel/applications/${applicationId}/environment/${encodeURIComponent(key)}`,
      { method: "PUT", body: JSON.stringify({ value }) },
    ),
  deleteEnvironmentVariable: (applicationId, key) =>
    request(
      `/panel/applications/${applicationId}/environment/${encodeURIComponent(key)}`,
      { method: "DELETE" },
    ),
  deleteApplication: (applicationId) =>
    request(`/panel/applications/${applicationId}`, { method: "DELETE" }),
  nodes: () => request("/panel/nodes"),
  createNode: (body) =>
    request("/panel/nodes", { method: "POST", body: JSON.stringify(body) }),
  deleteNode: (nodeId) =>
    request(`/panel/nodes/${nodeId}`, { method: "DELETE" }),
  rotateNodeToken: (nodeId) =>
    request(`/panel/nodes/${nodeId}/rotate-token`, { method: "POST" }),
  domains: () => request("/panel/domains"),
  deployments: () => request("/panel/deployments"),
  cancelDeployment: (deploymentId) =>
    request(`/panel/deployments/${deploymentId}/cancel`, { method: "POST" }),
  notifications: () => request("/panel/notifications"),
  readNotification: (notificationId) =>
    request(`/panel/notifications/${notificationId}/read`, { method: "POST" }),
  readAllNotifications: () =>
    request("/panel/notifications/read-all", { method: "POST" }),
  monitoringSummary: () => request("/panel/monitoring/summary"),
  monitoringSettings: () => request("/panel/monitoring/settings"),
  updateMonitoringSettings: (body) =>
    request("/panel/monitoring/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  monitoredApplications: () => request("/panel/monitoring/applications"),
  updateApplicationMonitoring: (applicationId, body) =>
    request(`/panel/monitoring/applications/${applicationId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  monitoringTimeseries: (scope, resourceId, range) =>
    request(
      `/panel/monitoring/timeseries?scope=${encodeURIComponent(scope)}&resourceId=${encodeURIComponent(resourceId)}&range=${encodeURIComponent(range)}`,
    ),
  monitoringAlerts: () => request("/panel/monitoring/alerts"),
};
