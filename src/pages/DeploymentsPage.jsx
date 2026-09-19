import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { panelApi } from "../api/client.js";
import { LogViewer } from "../components/LogViewer.jsx";
import { useFeedback } from "../components/FeedbackProvider.jsx";

const finishedCommandStatuses = new Set(["succeeded", "failed", "cancelled"]);

function displayDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Oslo",
  }).format(new Date(value));
}

function label(value) {
  if (!value) return "Unknown";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function commandLabel(command) {
  if (!command) return "Loading build output";
  if (command.cancelRequestedAt) return "Cancellation requested";
  if (command.status === "queued") return "Waiting for node";
  if (command.status === "leased") return "Building";
  return label(command.status);
}

function emptyLogMessage(command, loading) {
  if (loading && !command) return "Loading build output…";
  if (!command) return "Build output is not available for this deployment.";
  if (["queued", "leased"].includes(command.status))
    return "The build has started. Waiting for output from the node…";
  return "No build output was captured for this deployment.";
}

export function DeploymentsPage() {
  const feedback = useFeedback();
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [logSnapshots, setLogSnapshots] = useState({});
  const [logError, setLogError] = useState("");
  const [logLoading, setLogLoading] = useState(false);
  const [logRefresh, setLogRefresh] = useState(0);

  const expandedDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === expandedId),
    [deployments, expandedId],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await panelApi.deployments();
      setDeployments(response.data);
    } catch (caught) {
      setError(caught.message || "Could not load deployments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!expandedDeployment?.commandId) return undefined;

    let stopped = false;
    let timer;
    const deployment = expandedDeployment;

    async function poll() {
      setLogLoading(true);
      setLogError("");
      try {
        const response = await panelApi.deploymentLogs(
          deployment.applicationId,
          deployment.commandId,
        );
        if (stopped) return;
        const snapshot = response.data;
        setLogSnapshots((current) => ({
          ...current,
          [deployment.id]: snapshot,
        }));
        setLogLoading(false);

        if (finishedCommandStatuses.has(snapshot.status)) {
          setDeployments((current) => {
            const existing = current.find((item) => item.id === deployment.id);
            if (!existing || existing.status === snapshot.status) return current;
            return current.map((item) =>
              item.id === deployment.id
                ? { ...item, status: snapshot.status }
                : item,
            );
          });
          return;
        }
        timer = window.setTimeout(poll, 1_000);
      } catch (caught) {
        if (stopped) return;
        setLogError(caught.message || "Could not load build output");
        setLogLoading(false);
        if (["queued", "building", "deploying"].includes(deployment.status))
          timer = window.setTimeout(poll, 2_000);
      }
    }

    poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [expandedDeployment, logRefresh]);

  function toggleLogs(deployment) {
    setLogError("");
    setExpandedId((current) => (current === deployment.id ? "" : deployment.id));
  }

  async function copyBuildLogs(output) {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      feedback.success("Build logs copied.");
    } catch {
      feedback.error("Could not copy build logs to the clipboard.");
    }
  }

  return (
    <div className="resource-page">
      <div className="resource-heading">
        <div>
          <h2>Deployments</h2>
          <p>Build and release history across your workspace.</p>
        </div>
        <button className="secondary" onClick={load} disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
          Refresh
        </button>
      </div>
      {error && <div className="data-error">{error}</div>}
      <div className="resource-list">
        {!loading && deployments.length === 0 && <div className="empty-row">No deployments yet.</div>}
        {deployments.map((deployment) => {
          const expanded = expandedId === deployment.id;
          const snapshot = logSnapshots[deployment.id];
          return (
            <div className="deployment-page-item" key={deployment.id}>
              <div className="deployment-page-row">
                <span className="resource-symbol"><GitBranch size={17} /></span>
                <div className="resource-main">
                  <b>{deployment.applicationName}</b>
                  <span>{deployment.commitSha?.slice(0, 12) || "Revision pending"}</span>
                </div>
                <div className="resource-detail"><small>Source</small><b>{label(deployment.source)}</b></div>
                <div className="resource-detail"><small>Created</small><b>{displayDate(deployment.createdAt)}</b></div>
                <span className={`deployment-state ${deployment.status}`}>{label(deployment.status)}</span>
                <button
                  className="secondary compact-button deployment-log-toggle"
                  onClick={() => toggleLogs(deployment)}
                  disabled={!deployment.commandId}
                  aria-expanded={expanded}
                  aria-controls={`deployment-log-${deployment.id}`}
                  aria-label={`${expanded ? "Hide" : "Show"} build logs for ${deployment.applicationName}`}
                  title={deployment.commandId ? undefined : "No build command is linked to this deployment"}
                >
                  <ScrollText size={13} />
                  Build logs
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>
              {expanded && (
                <section
                  className="deployment-build-log"
                  id={`deployment-log-${deployment.id}`}
                  aria-label={`Build logs for ${deployment.applicationName}`}
                >
                  <div className="deployment-build-log-head">
                    <div>
                      <h3>Build output</h3>
                      <p>
                        {commandLabel(snapshot)}
                        {snapshot?.startedAt ? ` · Started ${displayDate(snapshot.startedAt)}` : ""}
                        {snapshot?.finishedAt ? ` · Finished ${displayDate(snapshot.finishedAt)}` : ""}
                      </p>
                    </div>
                    <div className="log-actions">
                      <button
                        className="secondary compact-button"
                        onClick={() => copyBuildLogs(snapshot?.output)}
                        disabled={!snapshot?.output}
                      >
                        <Copy size={13} /> Copy logs
                      </button>
                      <button
                        className="secondary compact-button"
                        onClick={() => setLogRefresh((current) => current + 1)}
                        disabled={logLoading}
                      >
                        {logLoading ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}
                        Refresh output
                      </button>
                    </div>
                  </div>
                  {logError && <div className="data-error">{logError}</div>}
                  <LogViewer
                    content={snapshot?.output || ""}
                    emptyMessage={emptyLogMessage(snapshot, logLoading)}
                    ariaLabel={`Build log output for ${deployment.applicationName}`}
                  />
                </section>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
