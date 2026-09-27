import { useEffect, useRef, useState } from "react";
import {
  Box,
  Copy,
  ExternalLink,
  FileKey2,
  GitBranch,
  KeyRound,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  ScrollText,
  Trash2,
  XCircle,
} from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "../components/FeedbackProvider.jsx";
import { PersistentFileModal } from "../components/PersistentFileModal.jsx";
import { LogViewer } from "../components/LogViewer.jsx";

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

const runtimeActionStatus = {
  deploy: "deploying",
  restart: "restarting",
  start: "starting",
  stop: "stopping",
};

const applicationDetailCache = new Map();

function detailCacheKey(teamId, isPlatformAdmin, applicationId) {
  return `${teamId || "unknown"}:${isPlatformAdmin ? "admin" : "member"}:${applicationId}`;
}

function displayedProcessStatus(application, process, transition) {
  if (!process.enabled) return "disabled";
  if (transition) {
    const snapshotAt = Date.parse(process.recordedAt || "");
    const completedAt = Date.parse(transition.completedAt || "");
    const snapshotIsCurrent =
      transition.completedAt &&
      Number.isFinite(snapshotAt) &&
      Number.isFinite(completedAt) &&
      snapshotAt >= completedAt;
    if (!snapshotIsCurrent && Date.now() < transition.expiresAt) {
      return transition.status;
    }
  }
  if (application.status === "stopped") return "stopped";
  return process.status || "waiting for agent";
}

export function ApplicationsPage({
  team,
  isPlatformAdmin,
  initialApplications = [],
  initialApplicationId,
  refreshKey,
  onEdit,
  onDelete,
  onApplicationSelect,
  onStatusRefresh,
  onApplicationsLoaded,
}) {
  const feedback = useFeedback();
  const initialSelectedId =
    initialApplicationId || initialApplications[0]?.id || "";
  const [applications, setApplications] = useState(initialApplications);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [detail, setDetail] = useState(() =>
    initialSelectedId
      ? applicationDetailCache.get(
          detailCacheKey(team?.id, isPlatformAdmin, initialSelectedId),
        ) || null
      : null,
  );
  const [logs, setLogs] = useState("");
  const [logStatus, setLogStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [runtimeTransition, setRuntimeTransition] = useState(null);
  const [error, setError] = useState("");
  const [variable, setVariable] = useState({ key: "", value: "" });
  const [persistentFilePath, setPersistentFilePath] = useState("");
  const streamController = useRef(null);
  const detailRequest = useRef(0);
  const canMutate = ["owner", "administrator", "developer"].includes(
    team?.role,
  );

  async function loadApplications(preferredId = selectedId) {
    const response = await panelApi.applications();
    setApplications(response.data);
    onApplicationsLoaded?.(response.data);
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
    const requestId = ++detailRequest.current;
    const response = await panelApi.application(applicationId);
    if (requestId !== detailRequest.current) return;
    applicationDetailCache.set(
      detailCacheKey(team?.id, isPlatformAdmin, applicationId),
      response.data,
    );
    setDetail(response.data);
  }

  async function load() {
    setError("");
    try {
      const preferredId = initialApplicationId || selectedId;
      const detailPromise = preferredId
        ? loadDetail(preferredId).then(
            () => null,
            (error) => error,
          )
        : Promise.resolve(null);
      const id = await loadApplications(preferredId);
      const detailError = await detailPromise;
      if (id !== preferredId) await loadDetail(id);
      else if (detailError) throw detailError;
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
  }, [refreshKey]);

  useEffect(() => {
    if (!initialApplications.length) return;
    setApplications(initialApplications);
    if (!selectedId) setSelectedId(initialApplications[0].id);
  }, [initialApplications]);

  useEffect(() => {
    if (!initialApplicationId || initialApplicationId === selectedId) return;
    select(initialApplicationId, false);
  }, [initialApplicationId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadDetail(selectedId).catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [selectedId, team?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void loadApplications(selectedId).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [selectedId, team?.id]);

  async function select(applicationId, updateRoute = true) {
    streamController.current?.abort();
    setPersistentFilePath("");
    setRuntimeTransition(null);
    setSelectedId(applicationId);
    setDetail(
      applicationDetailCache.get(
        detailCacheKey(team?.id, isPlatformAdmin, applicationId),
      ) || null,
    );
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

  async function refreshRuntimeState(applicationId) {
    await Promise.allSettled([
      loadApplications(applicationId),
      loadDetail(applicationId),
      Promise.resolve(onStatusRefresh?.()),
    ]);
  }

  async function followCommand(
    applicationId,
    commandId,
    { refreshStatus = false } = {},
  ) {
    streamController.current?.abort();
    const controller = new AbortController();
    streamController.current = controller;
    let lastSnapshot = null;
    try {
      while (!controller.signal.aborted) {
        const response = await panelApi.applicationCommand(
          applicationId,
          commandId,
        );
        const snapshot = response.data;
        lastSnapshot = snapshot;
        setLogs(snapshot.output || "Waiting for output from the node…");
        setLogStatus(
          snapshot.cancelRequestedAt
            ? "Cancellation requested"
            : label(snapshot.status),
        );
        if (refreshStatus) await refreshRuntimeState(applicationId);
        if (["succeeded", "failed", "cancelled"].includes(snapshot.status))
          break;
        await new Promise((resolve, reject) => {
          const onAbort = () => {
            window.clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          };
          const timeout = window.setTimeout(() => {
            controller.signal.removeEventListener("abort", onAbort);
            resolve();
          }, 1_000);
          controller.signal.addEventListener("abort", onAbort, { once: true });
        });
      }
      if (refreshStatus) await refreshRuntimeState(applicationId);
      else
        await Promise.all([
          loadApplications(applicationId),
          loadDetail(applicationId),
        ]);
      return lastSnapshot;
    } catch (caught) {
      if (caught.name !== "AbortError")
        feedback.error(
          caught.message || "The command output stream was interrupted",
        );
      return lastSnapshot;
    } finally {
      if (streamController.current === controller)
        streamController.current = null;
    }
  }

  async function action(actionName) {
    if (!detail) return;
    setBusy(actionName);
    setRuntimeTransition({
      status: runtimeActionStatus[actionName],
      completedAt: null,
      expiresAt: Number.POSITIVE_INFINITY,
    });
    setError("");
    try {
      const response = await panelApi.applicationAction(detail.id, actionName);
      feedback.success(`${label(actionName)} queued for ${detail.name}.`);
      if (response.data.commandId) {
        setLogs(`Waiting for ${actionName} output…`);
        setLogStatus("Queued");
        await refreshRuntimeState(detail.id);
        const command = await followCommand(detail.id, response.data.commandId, {
          refreshStatus: true,
        });
        if (command?.status === "succeeded") {
          setRuntimeTransition({
            status: actionName === "stop" ? "stopped" : "online",
            completedAt: command.finishedAt || new Date().toISOString(),
            expiresAt: Date.now() + 45_000,
          });
        } else {
          setRuntimeTransition(null);
        }
      } else {
        setRuntimeTransition(null);
        await refreshRuntimeState(detail.id);
      }
    } catch (caught) {
      setRuntimeTransition(null);
      feedback.error(caught.message || "Could not queue application action");
    } finally {
      setBusy("");
    }
  }

  async function deleteCurrentApplication() {
    if (!detail || !onDelete) return;
    setBusy("delete");
    try {
      await onDelete(detail);
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
        feedback.error(caught.message || "Could not load logs");
    } finally {
      setBusy("");
    }
  }

  async function copyRuntimeLogs() {
    if (!logs) return;
    try {
      await navigator.clipboard.writeText(logs);
      feedback.success("Runtime logs copied.");
    } catch {
      feedback.error("Could not copy runtime logs to the clipboard.");
    }
  }

  async function rollback(deployment) {
    if (!detail) return;
    const revision = deployment.commitSha.slice(0, 7);
    const approved = await feedback.confirm({
      title: `Rollback ${detail.name}?`,
      message: `Commit ${revision} will be deployed again.`,
      confirmLabel: "Queue rollback",
      tone: "warning",
    });
    if (!approved) return;
    setBusy(`rollback-${deployment.id}`);
    setError("");
    try {
      const response = await panelApi.rollbackApplication(detail.id, deployment.id);
      feedback.warning(`Rollback to ${revision} queued.`);
      setLogs("Waiting for rollback output…");
      setLogStatus("Queued");
      setBusy("");
      await followCommand(detail.id, response.data.commandId);
    } catch (caught) {
      feedback.error(caught.message || "Could not queue rollback");
    } finally {
      setBusy("");
    }
  }

  async function cancel(deployment) {
    const approved = await feedback.confirm({
      title: "Cancel deployment?",
      message:
        "The running deployment will be asked to stop as soon as possible.",
      confirmLabel: "Cancel deployment",
      tone: "warning",
    });
    if (!approved) return;
    setBusy(`cancel-${deployment.id}`);
    setError("");
    try {
      const response = await panelApi.cancelDeployment(deployment.id);
      feedback.warning(
        response.data.cancellationState === "cancelled"
          ? "Deployment cancelled."
          : "Cancellation requested from the node.",
      );
      await loadDetail(detail.id);
    } catch (caught) {
      feedback.error(caught.message || "Could not cancel deployment");
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
      feedback.success(
        "Environment variable saved. Restart or deploy to apply it.",
      );
      await loadDetail(detail.id);
    } catch (caught) {
      feedback.error(caught.message || "Could not save environment variable");
    } finally {
      setBusy("");
    }
  }

  async function removeVariable(key) {
    if (!detail) return;
    const approved = await feedback.confirm({
      title: `Delete ${key}?`,
      message:
        "The variable will be removed. Restart or deploy the application to apply the change.",
      confirmLabel: "Delete variable",
    });
    if (!approved) return;
    setBusy(`environment-${key}`);
    setError("");
    try {
      await panelApi.deleteEnvironmentVariable(detail.id, key);
      feedback.success(
        "Environment variable removed. Restart or deploy to apply it.",
      );
      await loadDetail(detail.id);
    } catch (caught) {
      feedback.error(caught.message || "Could not remove environment variable");
    } finally {
      setBusy("");
    }
  }

  const displayedDetailStatus =
    detail && runtimeTransition && !runtimeTransition.completedAt
      ? runtimeTransition.status
      : detail?.status;

  return (
    <div className="applications-page">
      {error && <div className="data-error">{error}</div>}
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
            <div className="empty-detail">
              {selectedId ? "Loading application…" : "Select an application."}
            </div>
          ) : (
            <>
              <div className="application-detail-head">
                <div>
                  <div className="detail-title-line">
                    <h2>{detail.name}</h2>
                    <span className={`detail-status ${displayedDetailStatus}`}>
                      {label(displayedDetailStatus)}
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
                      onClick={() => onEdit?.(detail.id)}
                      disabled={Boolean(busy)}
                    >
                      <Pencil size={14} /> Edit
                    </button>
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
                    <button
                      className="secondary danger-action"
                      onClick={deleteCurrentApplication}
                      disabled={Boolean(busy)}
                      title="Delete application"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>

              <div className="detail-facts">
                {isPlatformAdmin && <div><small>Node</small><b>{detail.nodeName}</b><span>{label(detail.nodeStatus)}</span></div>}
                {isPlatformAdmin && <div><small>Primary port</small><b>{detail.internalPort || "—"}</b><span>Auto-assigned</span></div>}
                <div><small>Origin TLS</small><b>{label(detail.proxyStatus)}</b><span>{displayDate(detail.certificateExpiresAt)}</span></div>
                <div><small>Repository</small><b>{detail.repository || "Manual"}</b><span>{detail.branch}</span></div>
                <div><small>Processes</small><b>{detail.processes?.length || 1}</b><span>Managed by PM2</span></div>
                <div><small>Hostnames</small><b>{detail.hostnames?.length || 1}</b><span>Cloudflare + TLS</span></div>
              </div>

              {detail.processes?.length > 0 && (
                <section className="detail-section">
                  <div className="detail-section-head">
                    <div><h3>Processes</h3><p>All services deploy from the same repository and release.</p></div>
                  </div>
                  <div className="application-process-list">
                    {detail.processes.map((process) => {
                      const processStatus = displayedProcessStatus(
                        detail,
                        process,
                        runtimeTransition,
                      );
                      return (
                        <div className="application-process-row" key={process.id}>
                          <span><b>{process.name}</b><small>{process.type}{process.primary ? " · main domain" : ""}</small></span>
                          <code>{process.executable} {process.arguments.join(" ")}</code>
                          <span><b>{process.hostname || (process.public ? detail.hostname : "Internal only")}</b><small>{["web", "api"].includes(process.type) ? (isPlatformAdmin && process.internalPort ? `Auto port ${process.internalPort}` : "Auto-assigned port") : "No port"}</small></span>
                          <span className={`process-runtime-status ${processStatus}`}><i></i>{processStatus}</span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {detail.persistentPaths?.length > 0 && (
                <section className="detail-section">
                  <div className="detail-section-head">
                    <div>
                      <h3>Persistent storage</h3>
                      <p>Files and directories retained across deployments.</p>
                    </div>
                  </div>
                  <div className="persistent-path-list">
                    {detail.persistentPaths.map((item) => (
                      <div className="persistent-path-row" key={item.path}>
                        <FileKey2 size={15} />
                        <span>
                          <b>{item.path}</b>
                          <small>{label(item.type)}</small>
                        </span>
                        {canMutate && item.type === "file" && (
                          <button
                            className="secondary compact-button"
                            onClick={() => setPersistentFilePath(item.path)}
                          >
                            Initialize file
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="detail-section">
                <div className="detail-section-head">
                  <div><h3>Runtime logs</h3><p>Latest PM2 output from the assigned node.</p></div>
                  <div className="log-actions">
                    <button
                      className="secondary"
                      onClick={copyRuntimeLogs}
                      disabled={!logs}
                    >
                      <Copy size={15} /> Copy logs
                    </button>
                    <button className="secondary" onClick={refreshLogs} disabled={busy === "logs"}>
                      {busy === "logs" ? <LoaderCircle className="spin" size={15} /> : <ScrollText size={15} />}
                      Refresh logs
                    </button>
                  </div>
                </div>
                {logStatus && <div className="log-status">Node request: {logStatus}</div>}
                <LogViewer
                  content={logs}
                  emptyMessage="Request a log snapshot to see the latest 200 lines."
                  ariaLabel="Runtime log output"
                />
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
      <PersistentFileModal
        applicationId={detail?.id}
        path={persistentFilePath}
        onClose={() => setPersistentFilePath("")}
        onCompleted={() => loadDetail(detail?.id)}
      />
    </div>
  );
}
