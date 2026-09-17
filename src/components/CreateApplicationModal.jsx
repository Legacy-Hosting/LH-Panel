import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  GitBranch,
  Globe2,
  LoaderCircle,
  Rocket,
  Server,
  X,
} from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "./FeedbackProvider.jsx";

function metadata(value) {
  if (!value || typeof value === "object") return value || {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function parseEnvironment(value) {
  const result = {};
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Invalid environment line: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      throw new Error(`Invalid environment key: ${key}`);
    if (key === "PORT") throw new Error("PORT is managed automatically.");
    result[key] = line.slice(separator + 1);
  }
  return result;
}

export function CreateApplicationModal({ open, onClose, onCreated }) {
  const feedback = useFeedback();
  const [nodes, setNodes] = useState([]);
  const [repositories, setRepositories] = useState([]);
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState({
    name: "",
    nodeId: "",
    repository: "",
    branch: "main",
    rootDomain: "",
    domain: "",
    autoDeploy: true,
    environment: "NODE_ENV=production",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      panelApi.nodes(),
      panelApi.githubRepositories(),
      panelApi.cloudflareZones(),
    ])
      .then(([nodeResponse, repositoryResponse, zoneResponse]) => {
        if (!active) return;
        setNodes(nodeResponse.data);
        setRepositories(repositoryResponse.data);
        setZones(zoneResponse.data);
        setForm((current) => ({
          ...current,
          nodeId: current.nodeId || nodeResponse.data[0]?.id || "",
          rootDomain: current.rootDomain || zoneResponse.data[0]?.name || "",
        }));
      })
      .catch((caught) =>
        setError(caught.message || "Could not load form data"),
      );
    return () => {
      active = false;
    };
  }, [open]);

  const selectedRepository = useMemo(
    () =>
      repositories.find(
        (repository) => repository.fullName === form.repository,
      ),
    [repositories, form.repository],
  );

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await panelApi.createApplication({
        name: form.name,
        nodeId: form.nodeId,
        repository: form.repository || undefined,
        branch: form.branch,
        rootDomain: form.rootDomain,
        domain: form.domain,
        autoDeploy: form.autoDeploy,
        environment: parseEnvironment(form.environment),
      });
      await onCreated();
      feedback.success(`${form.name} was created and deployment was queued.`);
      onClose();
    } catch (caught) {
      feedback.error(caught.message || "Could not create application");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-application-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="new-application-title">New application</h2>
            <p>The repository will be inspected before deployment is queued.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {error && <div className="data-error">{error}</div>}
        <form className="application-form" onSubmit={submit}>
          <label>
            <span>Application name</span>
            <div className="auth-input">
              <Rocket size={16} />
              <input
                required
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]{2}"
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value.toLowerCase().replace(/\s+/g, "-"),
                  })
                }
                placeholder="customer-dashboard"
              />
            </div>
          </label>
          <div className="form-grid">
            <label>
              <span>Node</span>
              <div className="select-wrap">
                <Server size={16} />
                <select
                  required
                  value={form.nodeId}
                  onChange={(event) =>
                    setForm({ ...form, nodeId: event.target.value })
                  }
                >
                  <option value="">Select a node</option>
                  {nodes.map((node) => (
                    <option value={node.id} key={node.id}>
                      {node.name} · {node.region || node.publicIp}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label>
              <span>Cloudflare zone</span>
              <div className="select-wrap">
                <Globe2 size={16} />
                <select
                  required
                  value={form.rootDomain}
                  onChange={(event) =>
                    setForm({ ...form, rootDomain: event.target.value })
                  }
                >
                  <option value="">Select a zone</option>
                  {zones.map((zone) => (
                    <option value={zone.name} key={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>
          <label>
            <span>Hostname</span>
            <div className="auth-input">
              <Globe2 size={16} />
              <input
                required
                value={form.domain}
                onChange={(event) =>
                  setForm({ ...form, domain: event.target.value.toLowerCase() })
                }
                placeholder={
                  form.rootDomain ? `app.${form.rootDomain}` : "app.example.com"
                }
              />
            </div>
          </label>
          <div className="form-grid">
            <label>
              <span>GitHub repository</span>
              <div className="select-wrap">
                <GitBranch size={16} />
                <select
                  required
                  value={form.repository}
                  onChange={(event) => {
                    const repository = repositories.find(
                      (item) => item.fullName === event.target.value,
                    );
                    setForm({
                      ...form,
                      repository: event.target.value,
                      branch:
                        metadata(repository?.metadata).defaultBranch || "main",
                    });
                  }}
                >
                  <option value="">Select a repository</option>
                  {repositories.map((repository) => (
                    <option value={repository.fullName} key={repository.id}>
                      {repository.fullName}
                      {metadata(repository.metadata).private
                        ? " · Private"
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label>
              <span>Branch</span>
              <div className="auth-input">
                <GitBranch size={16} />
                <input
                  required
                  value={form.branch}
                  onChange={(event) =>
                    setForm({ ...form, branch: event.target.value })
                  }
                />
              </div>
            </label>
          </div>
          <label>
            <span>Environment variables</span>
            <div className="environment-editor">
              <Braces size={16} />
              <textarea
                value={form.environment}
                onChange={(event) =>
                  setForm({ ...form, environment: event.target.value })
                }
                spellCheck="false"
                placeholder={
                  "NODE_ENV=production\nAPI_URL=https://api.example.com"
                }
              />
            </div>
          </label>
          <label className="setting-toggle compact-toggle">
            <input
              type="checkbox"
              checked={form.autoDeploy}
              onChange={(event) =>
                setForm({ ...form, autoDeploy: event.target.checked })
              }
            />
            <span>
              <b>Deploy automatically on push</b>
              <small>
                Only pushes to {form.branch || "the selected branch"}.
              </small>
            </span>
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy || !selectedRepository}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Rocket size={16} />
              )}
              {busy ? "Inspecting and creating…" : "Create application"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
