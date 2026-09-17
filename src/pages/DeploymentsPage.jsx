import { useEffect, useState } from "react";
import { GitBranch, LoaderCircle, RefreshCw } from "lucide-react";
import { panelApi } from "../api/client.js";

function displayDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Oslo",
  }).format(new Date(value));
}

function label(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DeploymentsPage() {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        {deployments.map((deployment) => (
          <div className="deployment-page-row" key={deployment.id}>
            <span className="resource-symbol"><GitBranch size={17} /></span>
            <div className="resource-main">
              <b>{deployment.applicationName}</b>
              <span>{deployment.commitSha?.slice(0, 12) || "Revision pending"}</span>
            </div>
            <div className="resource-detail"><small>Source</small><b>{label(deployment.source)}</b></div>
            <div className="resource-detail"><small>Created</small><b>{displayDate(deployment.createdAt)}</b></div>
            <span className={`deployment-state ${deployment.status}`}>{label(deployment.status)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
