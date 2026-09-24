import { useEffect, useState } from "react";
import {
  Cloud,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  Unplug,
} from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "../components/FeedbackProvider.jsx";

export function SettingsPage() {
  const feedback = useFeedback();
  const [cloudflare, setCloudflare] = useState([]);
  const [github, setGithub] = useState([]);
  const [githubUser, setGithubUser] = useState(null);
  const [githubOrganization, setGithubOrganization] = useState(
    "GitHub organization",
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const integrationResult = new URLSearchParams(window.location.search).get(
    "integration",
  );

  useEffect(() => {
    if (!integrationResult) return;
    const results = {
      cloudflare_connected: [
        "success",
        "Cloudflare was connected successfully.",
      ],
      cloudflare_failed: ["error", "Cloudflare could not be connected."],
      cloudflare_denied: ["warning", "Cloudflare access was not approved."],
      github_connected: ["success", "GitHub was connected successfully."],
      github_failed: ["error", "GitHub could not be connected."],
      github_denied: ["warning", "GitHub authorization was cancelled."],
      github_organization_membership_required: [
        "error",
        "This GitHub account is not an active member of NextarchStudio.",
      ],
      github_sso_required: [
        "error",
        "Authorize Legacy Hosting Deployments for your organization SSO, then connect GitHub again.",
      ],
      github_no_repository_access: [
        "error",
        "This GitHub account has no repositories available through the organization installation.",
      ],
      github_installation_missing: [
        "error",
        "Legacy Hosting Deployments is not installed on NextarchStudio.",
      ],
      github_installation_unavailable: [
        "error",
        "The NextarchStudio GitHub App installation is unavailable.",
      ],
      github_account_already_connected: [
        "error",
        "This GitHub account is already linked to another Legacy Hosting account.",
      ],
      github_reauthorization_required: [
        "warning",
        "Your GitHub authorization expired. Connect GitHub again.",
      ],
    };
    const result = results[integrationResult];
    if (result) feedback.notify(result[0], result[1]);

    const url = new URL(window.location.href);
    url.searchParams.delete("integration");
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [feedback, integrationResult]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const tasks = [
          panelApi.cloudflareConnections(),
          panelApi.githubConnections(),
        ];
        const [connections, githubConnections] = await Promise.all(tasks);
        if (!active) return;
        setCloudflare(connections.data);
        setGithub(githubConnections.data);
        setGithubUser(githubConnections.meta?.userConnection || null);
        setGithubOrganization(
          githubConnections.meta?.organization || "GitHub organization",
        );
      } catch (caught) {
        if (active) setError(caught.message || "Could not load settings");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  async function connectCloudflare() {
    setBusy("cloudflare");
    setError("");
    try {
      const response = await panelApi.cloudflareConnect(
        "/settings/integrations",
      );
      window.location.assign(response.data.authorizationUrl);
    } catch (caught) {
      feedback.error(caught.message || "Could not start Cloudflare connection");
      setBusy("");
    }
  }

  async function connectGithub() {
    setBusy("github");
    setError("");
    try {
      const response = await panelApi.githubConnect("/settings/integrations");
      window.location.assign(response.data.authorizationUrl);
    } catch (caught) {
      feedback.error(caught.message || "Could not start GitHub authorization");
      setBusy("");
    }
  }

  async function disconnect(provider, connection) {
    const approved = await feedback.confirm({
      title: `Disconnect ${connection.displayName}?`,
      message:
        provider === "github"
          ? "Your personal GitHub authorization and repository list will be removed. Existing applications and the organization App installation remain available for deploys."
          : "Legacy Hosting will lose access to these zones. Existing DNS records remain, but DNS and certificate changes require a new Cloudflare connection.",
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (!approved) return;
    const busyKey = `${provider}-${connection.id}`;
    setBusy(busyKey);
    setError("");
    try {
      if (provider === "github") {
        await panelApi.disconnectGithub();
        setGithubUser(null);
      } else {
        await panelApi.disconnectCloudflare(connection.id);
        setCloudflare((current) =>
          current.filter((item) => item.id !== connection.id),
        );
      }
      feedback.success(`${connection.displayName} was disconnected.`);
    } catch (caught) {
      feedback.error(caught.message || `Could not disconnect ${provider}`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="settings-page">
      {error && <div className="data-error">{error}</div>}

      <div className="settings-heading">
        <div>
          <h2>Integrations</h2>
          <p>Connect services separately for this workspace.</p>
        </div>
      </div>

      <div className="integration-grid">
        <section className="settings-card">
          <div className="settings-card-head">
            <div className="integration-icon cloudflare-icon">
              <Cloud size={21} />
            </div>
            <div>
              <h3>Cloudflare</h3>
              <p>Zones and proxied DNS records</p>
            </div>
          </div>
          <div className="connection-list">
            {cloudflare.map((connection) => (
              <div className="connection-row" key={connection.id}>
                <div>
                  <b>{connection.displayName}</b>
                  <span>{connection.zones} available zones</span>
                </div>
                <div className="connection-actions">
                  <span className="connected-pill">Connected</span>
                  <button
                    className="row-action danger-action"
                    onClick={() => disconnect("cloudflare", connection)}
                    disabled={busy === `cloudflare-${connection.id}`}
                    aria-label={`Disconnect Cloudflare ${connection.displayName}`}
                    title="Disconnect Cloudflare"
                  >
                    {busy === `cloudflare-${connection.id}` ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : (
                      <Unplug size={14} />
                    )}
                  </button>
                </div>
              </div>
            ))}
            {cloudflare.length === 0 && (
              <p className="settings-empty">No Cloudflare account connected.</p>
            )}
          </div>
          <button
            className="secondary settings-action"
            onClick={connectCloudflare}
            disabled={busy === "cloudflare"}
          >
            {busy === "cloudflare" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ExternalLink size={16} />
            )}
            Connect Cloudflare
          </button>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <div className="integration-icon github-icon">
              <GitBranch size={21} />
            </div>
            <div>
              <h3>GitHub</h3>
              <p>Personal and organization repositories</p>
            </div>
          </div>
          <p className="settings-copy">
            The organization installs the GitHub App once. Your GitHub account
            is authorized separately, so you only see repositories your user can
            access through teams or direct permission.
          </p>
          <div className="connection-list">
            {github.map((connection) => (
              <div className="connection-row" key={connection.id}>
                <div>
                  <b>{connection.displayName}</b>
                  <span>
                    Organization App installation · ID{" "}
                    {connection.installationId}
                  </span>
                </div>
                <div className="connection-actions">
                  <span className="connected-pill">App installed</span>
                </div>
              </div>
            ))}
            {github.length === 0 && (
              <div className="connection-row">
                <div>
                  <b>{githubOrganization}</b>
                  <span>Organization App installation managed by an owner</span>
                </div>
                <span className="connected-pill">Organization managed</span>
              </div>
            )}
            {githubUser ? (
              <div className="connection-row">
                <div>
                  <b>@{githubUser.githubLogin}</b>
                  <span>
                    Your GitHub account · {githubUser.repositories} accessible
                    repositories
                  </span>
                </div>
                <div className="connection-actions">
                  <span className="connected-pill">Authorized</span>
                  <button
                    className="row-action danger-action"
                    onClick={() =>
                      disconnect("github", {
                        id: githubUser.id,
                        displayName: `@${githubUser.githubLogin}`,
                      })
                    }
                    disabled={busy === `github-${githubUser.id}`}
                    aria-label={`Disconnect GitHub account ${githubUser.githubLogin}`}
                    title="Disconnect GitHub account"
                  >
                    {busy === `github-${githubUser.id}` ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : (
                      <Unplug size={14} />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <p className="settings-empty">No GitHub user authorized.</p>
            )}
          </div>
          <button
            className="secondary settings-action"
            onClick={connectGithub}
            disabled={busy === "github"}
          >
            {busy === "github" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <GitBranch size={16} />
            )}
            {githubUser ? "Reconnect GitHub account" : "Connect GitHub account"}
          </button>
        </section>
      </div>
    </div>
  );
}
