import { useEffect, useState } from "react";
import {
  Cloud,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "../components/FeedbackProvider.jsx";

export function SettingsPage({ user }) {
  const feedback = useFeedback();
  const [registration, setRegistration] = useState(null);
  const [cloudflare, setCloudflare] = useState([]);
  const [github, setGithub] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const integrationResult = new URLSearchParams(window.location.search).get(
    "integration",
  );

  useEffect(() => {
    if (!integrationResult) return;
    const results = {
      cloudflare_connected: ["success", "Cloudflare was connected successfully."],
      cloudflare_failed: ["error", "Cloudflare could not be connected."],
      cloudflare_denied: ["warning", "Cloudflare access was not approved."],
      github_connected: ["success", "GitHub was connected successfully."],
      github_failed: ["error", "GitHub could not be connected."],
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
        if (user.isPlatformAdmin) tasks.push(panelApi.registrationSettings());
        const [connections, githubConnections, settings] =
          await Promise.all(tasks);
        if (!active) return;
        setCloudflare(connections.data);
        setGithub(githubConnections.data);
        if (settings) setRegistration(settings.data);
      } catch (caught) {
        if (active) setError(caught.message || "Could not load settings");
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [user.isPlatformAdmin]);

  async function saveRegistration(event) {
    event.preventDefault();
    setBusy("registration");
    setError("");
    try {
      const response = await panelApi.updateRegistrationSettings(registration);
      setRegistration(response.data);
      feedback.success("Registration settings saved.");
    } catch (caught) {
      feedback.error(caught.message || "Could not update registration");
    } finally {
      setBusy("");
    }
  }

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
      window.location.assign(response.data.installationUrl);
    } catch (caught) {
      feedback.error(caught.message || "Could not start GitHub App installation");
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
                <span className="connected-pill">Connected</span>
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
            A GitHub App will provide repository-level access, private cloning
            and signed push webhooks without storing a personal access token.
          </p>
          <div className="connection-list">
            {github.map((connection) => (
              <div className="connection-row" key={connection.id}>
                <div>
                  <b>{connection.displayName}</b>
                  <span>{connection.repositories} available repositories</span>
                </div>
                <span className="connected-pill">Connected</span>
              </div>
            ))}
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
            Install GitHub App
          </button>
        </section>
      </div>

      {user.isPlatformAdmin && registration && (
        <>
          <div className="settings-heading registration-heading">
            <div>
              <h2>Platform access</h2>
              <p>Control who can create a Legacy Hosting account.</p>
            </div>
          </div>
          <form
            className="settings-card registration-card"
            onSubmit={saveRegistration}
          >
            <div className="settings-card-head">
              <div className="integration-icon access-icon">
                <Users size={21} />
              </div>
              <div>
                <h3>Registration</h3>
                <p>Applies across every Legacy Hosting product</p>
              </div>
            </div>
            <label className="setting-field">
              <span>Registration mode</span>
              <select
                value={registration.mode}
                onChange={(event) =>
                  setRegistration({ ...registration, mode: event.target.value })
                }
              >
                <option value="closed">Closed</option>
                <option value="invite_only">Invitation only</option>
                <option value="open">Open</option>
              </select>
            </label>
            <button
              className="primary save-settings"
              disabled={busy === "registration"}
            >
              {busy === "registration" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <ShieldCheck size={16} />
              )}
              Save access settings
            </button>
          </form>
        </>
      )}
    </div>
  );
}
