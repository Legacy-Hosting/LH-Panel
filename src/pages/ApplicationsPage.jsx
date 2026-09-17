import { useEffect, useRef, useState } from "react";
import {
  Box,
  ExternalLink,
  GitBranch,
  KeyRound,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  Trash2,
  XCircle,
} from "lucide-react";
import { panelApi } from "../api/client.js";

function displayDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Oslo",
  }).format(new Date(value));
}

function label(value) {
  if (!value) return "Unknown";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ApplicationsPage({
  team,
  initialApplicationId,
  onApplicationSelect,
}) {
  const [applications, setApplications] = useState([]);
  const [selectedId, setSelectedId] = useState(initialApplicationId || "");
  const [detail, setDetail] = useState(null);
  const [logs, setLogs] = useState("");
  const [logStatus, setLogStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [variable, setVariable] = useState({ key: "", value: "" });
  const streamController = useRef(null);
  const canMutate = ["owner", "administrator", "developer"].includes(
    team?.role,
  );

  async function loadApplications(preferredId = selectedId) {
    const response = await panelApi.applications();
    setApplications(response.data);
    const nextId =
      response.data.find((application) => application.id === preferredId)?.id ||
      response.data[0]?.id ||
      "";
    setSelectedId(nextId);
    return nextId;
  }

  async function loadDetail(applicationId = selectedId) {
    if (!applicationId) {
      setDetail(null);
      return;
    }
    const response = await panelApi.application(applicationId);
    setDetail(response.data);
  }

  async function load() {
    setError("");
    try {
      const id = await loadApplications(initialApplicationId || selectedId);
      await loadDetail(id);
      if (id && !initialApplicationId) {
        onApplicationSelect?.(id, { replace: true });
      }
    } catch (caught) {
      setError(caught.message || "Could not load applications");
    }
  }

  useEffect(() => {
    load();
    return () => {
      streamController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!initialApplicationId || initialApplicationId === selectedId) return;
    select(initialApplicationId, false);
  }, [initialApplicationId]);

  async function select(applicationId, updateRoute = true) {
    streamController.current?.abort();
    setSelectedId(applicationId);
    setBusy("");
    setLogs("");
    setLogStatus("");
    setError("");
    if (updateRoute) onApplicationSelect?.(applicationId);
    try {
      await loadDetail(applicationId);
    } catch (caught) {
      setError(caught.message || "Could not load application");
    }
  }

  async function followCommand(applicationId, commandId) {
    streamController.current?.abort();
    const controller = new AbortController();
    streamController.current = controller;
    try {
      await panelApi.streamApplicationCommand(
        applicationId,
        commandId,
        (snapshot) => {
          setLogs(snapshot.output || "Waiting for output from the node…");
          setLogStatus(
            snapshot.cancelRequestedAt
              ? "Cancellation requested"
              : label(snapshot.status),
          );
        },
        controller.signal,
      );
      await Promise.all([
        loadApplications(applicationId),
        loadDetail(applicationId),
      ]);
    } catch (caught) {
      if (caught.name !== "AbortError")
        setError(caught.message || "The command output stream was interrupted");
    } finally {
      if (streamController.current === controller)
        streamController.current = null;
    }
  }

  async function action(actionName) {
    if (!detail) return;
    setBusy(actionName);
    setError("");
    setNotice("");
    try {
      const response = await panelApi.applicationAction(detail.id, actionName);
      setNotice(`${label(actionName)} queued.`);
      if (actionName === "deploy" && response.data.commandId) {
        setLogs("Waiting for deployment output…");
        setLogStatus("Queued");
        setBusy("");
        await followCommand(detail.id, response.data.commandId);
      } else {
        await Promise.all([loadApplications(detail.id), loadDetail(detail.id)]);
      }
    } catch (caught) {
      setError(caught.message || "Could not queue application action");
    } finally {
      setBusy("");
    }
  }

  async function refreshLogs() {
    if (!detail) return;
    setBusy("logs");
    setError("");
    setLogStatus("Requesting logs from node…");
    try {
      const queued = await panelApi.applicationLogs(detail.id, 200);
      await followCommand(detail.id, queued.data.commandId);
    } catch (caught) {
      if (caught.name !== "AbortError")
        setError(caught.message || "Could not load logs");
    } finally {
      setBusy("");
    }
  }

  async function rollback(deployment) {
    if (
      !detail ||
      !window.confirm(
        `Deploy commit ${deployment.commitSha.slice(0, 7)} again on ${detail.name}?`,
      )
    )
      return;
    setBusy(`rollback-${deployment.id}`);
    setError("");
    try {
      const response = await panelApi.rollbackApplication(detail.id, deployment.id);
      setNotice(`Rollback to ${deployment.commitSha.slice(0, 7)} queued.`);
      setLogs("Waiting for rollback output…");
      setLogStatus("Queued");
      setBusy("");
      await followCommand(detail.id, response.data.commandId);
    } catch (caught) {
      setError(caught.message || "Could not queue rollback");
    } finally {
      setBusy("");
    }
  }

  async function cancel(deployment) {
    if (!window.confirm("Cancel this deployment?")) return;
    setBusy(`cancel-${deployment.id}`);
    setError("");
    try {
      const response = await panelApi.cancelDeployment(deployment.id);
      setNotice(
        response.data.cancellationState === "cancelled"
          ? "Deployment cancelled."
          : "Cancellation requested from the node.",
      );
      await loadDetail(detail.id);
    } catch (caught) {
      setError(caught.message || "Could not cancel deployment");
    } finally {
      setBusy("");
    }
  }

  async function saveVariable(event) {
    event.preventDefault();
    if (!detail) return;
    setBusy("environment");
    setError("");
    try {
      await panelApi.saveEnvironmentVariable(
        detail.id,
        variable.key,
        variable.value,
      );
      setVariable({ key: "", value: "" });
      setNotice("Environment variable saved. Restart or deploy to apply it.");
      await loadDetail(detail.id);
    } catch (caught) {
      setError(caught.message || "Could not save environment variable");
    } finally {
      setBusy("");
    }
  }

  async function removeVariable(key) {
    if (!detail || !window.confirm(`Delete environment variable ${key}?`))
      return;
    setBusy(`environment-${key}`);
    setError("");
    try {
      await panelApi.deleteEnvironmentVariable(detail.id, key);
      setNotice("Environment variable removed. Restart or deploy to apply it.");
      await loadDetail(detail.id);
    } catch (caught) {
      setError(caught.message || "Could not remove environment variable");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="applications-page">
      {error && <div className="data-error">{error}</div>}
      {notice && <div className="success-banner">{notice}</div>}
      <div className="applications-layout">
        <section className="application-browser">
          <div className="browser-heading">
            <div>
              <h2>Applications</h2>
              <p>{applications.length} in this workspace</p>
            </div>
            <button className="row-action" onClick={load} title="Refresh">
              <RefreshCw size={15} />
            </button>
          </div>
          <div className="browser-list">
            {applications.length === 0 && (
              <div className="empty-row">No applications yet.</div>
            )}
            {applications.map((application) => (
              <a
                className={`browser-app ${selectedId === application.id ? "active" : ""}`}
                href={`/applications/${encodeURIComponent(application.id)}`}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  select(application.id);
                }}
                key={application.id}
              >
                <span className="resource-symbol">
                  <Box size={17} />
                </span>
                <span>
                  <b>{application.name}</b>
                  <small>{application.domain}</small>
                </span>
                <i className={application.status === "Running" ? "green" : "gray"}></i>
              </a>
            ))}
          </div>
        </section>

        <section className="application-detail">
          {!detail ? (
            <div className="empty-detail">Select an application.</div>
          ) : (
            <>
              <div className="application-detail-head">
                <div>
                  <div className="detail-title-line">
                    <h2>{detail.name}</h2>
                    <span className={`detail-status ${detail.status}`}>
                      {label(detail.status)}
                    </span>
                  </div>
                  <a
                    href={`https://${detail.hostname}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {detail.hostname} <ExternalLink size={12} />
                  </a>
                </div>
                {canMutate && (
                  <div className="detail-actions">
                    <button
                      className="secondary"
                      onClick={() => action(detail.status === "stopped" ? "start" : "stop")}
                      disabled={Boolean(busy)}
                    >
                      {detail.status === "stopped" ? <Play size={14} /> : <Pause size={14} />}
                      {detail.status === "stopped" ? "Start" : "Stop"}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => action("restart")}
                      disabled={Boolean(busy)}
                    >
                      <RefreshCw size={14} /> Restart
                    </button>
                    <button
                      className="primary"
                      onClick={() => action("deploy")}
                      disabled={Boolean(busy) || !detail.repository}
                    >
                      <Play size={14} /> Deploy
                    </button>
                  </div>
                )}
              </div>

              <div className="detail-facts">
                <div><small>Node</small><b>{detail.nodeName}</b><span>{label(detail.nodeStatus)}</span></div>
                <div><small>Internal port</small><b>{detail.internalPort || "—"}</b><span>Loopback only</span></div>
                <div><small>Origin TLS</small><b>{label(detail.proxyStatus)}</b><span>{displayDate(detail.certificateExpiresAt)}</span></div>
                <div><small>Repository</small><b>{detail.repository || "Manual"}</b><span>{detail.branch}</span></div>
              </div>

              <section className="detail-section">
                <div className="detail-section-head">
                  <div><h3>Runtime logs</h3><p>Latest PM2 output from the assigned node.</p></div>
                  <button className="secondary" onClick={refreshLogs} disabled={busy === "logs"}>
                    {busy === "logs" ? <LoaderCircle className="spin" size={15} /> : <ScrollText size={15} />}
                    Refresh logs
                  </button>
                </div>
                {logStatus && <div className="log-status">Node request: {logStatus}</div>}
                <pre className="log-viewer">{logs || "Request a log snapshot to see the latest 200 lines."}</pre>
              </section>

              <section className="detail-section">
                <div className="detail-section-head">
                  <div><h3>Environment</h3><p>Secret values are write-only and never returned by the API.</p></div>
                </div>
                <div className="environment-list">
                  {detail.environment.length === 0 && <span className="muted-text">No custom variables.</span>}
                  {detail.environment.map((item) => (
                    <div className="environment-key" key={item.key}>
                      <KeyRound size={14} />
                      <b>{item.key}</b>
                      <span>••••••••</span>
                      {canMutate && (
                        <button className="row-action danger-action" onClick={() => removeVariable(item.key)} disabled={Boolean(busy)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canMutate && (
                  <form className="environment-form" onSubmit={saveVariable}>
                    <div className="auth-input"><input required pattern="[A-Za-z_][A-Za-z0-9_]*" placeholder="VARIABLE_NAME" value={variable.key} onChange={(event) => setVariable({ ...variable, key: event.target.value })} /></div>
                    <div className="auth-input"><input required type="password" placeholder="New secret value" value={variable.value} onChange={(event) => setVariable({ ...variable, value: event.target.value })} /></div>
                    <button className="secondary" disabled={busy === "environment" || variable.key === "PORT"}>
                      {busy === "environment" ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} Save
                    </button>
                  </form>
                )}
              </section>

              <section className="detail-section">
                <div className="detail-section-head">
                  <div><h3>Deployment history</h3><p>Manual, push, and rollback deployments.</p></div>
                </div>
                <div className="deployment-history">
                  {detail.deployments.length === 0 && <div className="empty-row">No deployments yet.</div>}
                  {detail.deployments.map((deployment) => (
                    <div className="deployment-history-row" key={deployment.id}>
                      <span className="resource-symbol"><GitBranch size={16} /></span>
                      <div><b>{deployment.commitSha?.slice(0, 7) || "Pending revision"}</b><small>{label(deployment.source)} · {displayDate(deployment.createdAt)}</small></div>
                      <span className={`deployment-state ${deployment.status}`}>{label(deployment.status)}</span>
                      <div className="deployment-row-actions">
                        {["queued", "building", "deploying"].includes(deployment.status) && deployment.commandId && (
                          <button className="secondary compact-button" onClick={() => followCommand(detail.id, deployment.commandId)}>
                            <ScrollText size={13} /> Output
                          </button>
                        )}
                        {canMutate && ["queued", "building", "deploying"].includes(deployment.status) && (
                          <button className="secondary compact-button danger-action" onClick={() => cancel(deployment)} disabled={Boolean(busy)}>
                            {busy === `cancel-${deployment.id}` ? <LoaderCircle className="spin" size={13} /> : <XCircle size={13} />} Cancel
                          </button>
                        )}
                        {canMutate && deployment.status === "succeeded" && deployment.commitSha && (
                          <button className="secondary compact-button" onClick={() => rollback(deployment)} disabled={Boolean(busy)}>
                            {busy === `rollback-${deployment.id}` ? <LoaderCircle className="spin" size={13} /> : <RotateCcw size={13} />} Rollback
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
