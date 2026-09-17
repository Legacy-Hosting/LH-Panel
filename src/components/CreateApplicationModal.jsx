import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  GitBranch,
  Globe2,
  LoaderCircle,
  Plus,
  Rocket,
  Server,
  Trash2,
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

function parseArguments(value) {
  const arguments_ = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g;
  for (const match of value.matchAll(pattern)) {
    arguments_.push((match[1] ?? match[2] ?? match[3]).replace(/\\([\\"'])/g, "$1"));
  }
  return arguments_;
}

function parseCommand(value) {
  const [command, ...args] = parseArguments(value.trim());
  if (!command) return undefined;
  if (!["npm", "pnpm", "yarn", "bun", "node"].includes(command))
    throw new Error(`Unsupported executable: ${command}`);
  return { command, args };
}

function lines(value) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const defaultProcesses = [
  {
    name: "web",
    type: "web",
    workingDirectory: ".",
    executable: "pnpm",
    arguments: "start",
    primary: true,
    public: true,
    routes: "/",
    hostname: "",
    enabled: true,
    startOrder: 0,
    instances: 1,
    restartDelayMs: 1000,
    inheritEnvironment: true,
    healthPath: "/health",
    hostVariable: "",
    portVariable: "",
    environment: "",
  },
  {
    name: "api",
    type: "api",
    workingDirectory: ".",
    executable: "pnpm",
    arguments: "run api",
    primary: false,
    public: true,
    routes: "/api\n/health\n/ready",
    hostname: "",
    enabled: true,
    startOrder: 1,
    instances: 1,
    restartDelayMs: 1000,
    inheritEnvironment: true,
    healthPath: "/health",
    hostVariable: "",
    portVariable: "",
    environment: "",
  },
  {
    name: "worker",
    type: "worker",
    workingDirectory: ".",
    executable: "pnpm",
    arguments: "run worker",
    primary: false,
    public: false,
    routes: "",
    hostname: "",
    enabled: true,
    startOrder: 2,
    instances: 1,
    restartDelayMs: 1000,
    inheritEnvironment: true,
    healthPath: "",
    hostVariable: "",
    portVariable: "",
    environment: "",
  },
];

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
    processMode: "automatic",
    processes: defaultProcesses,
    additionalHostnames: "",
    installCommand: "",
    buildCommand: "",
    checkCommands: "",
    persistentPaths: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      panelApi.applicationTargets(),
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

  function updateProcess(index, changes) {
    setForm((current) => ({
      ...current,
      processes: current.processes.map((process, processIndex) =>
        processIndex === index ? { ...process, ...changes } : process,
      ),
    }));
  }

  function selectPrimary(index) {
    setForm((current) => ({
      ...current,
      processes: current.processes.map((process, processIndex) => ({
        ...process,
        primary: processIndex === index,
        public: processIndex === index ? true : process.public,
        hostname: processIndex === index ? "" : process.hostname,
      })),
    }));
  }

  function addProcess() {
    setForm((current) => ({
      ...current,
      processes: [
        ...current.processes,
        {
          ...defaultProcesses[2],
          name: `process-${current.processes.length + 1}`,
          startOrder: current.processes.length,
        },
      ],
    }));
  }

  function removeProcess(index) {
    setForm((current) => ({
      ...current,
      processes: current.processes.filter(
        (_process, processIndex) => processIndex !== index,
      ),
    }));
  }

  if (!open) return null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const processes =
        form.processMode === "multiple"
          ? form.processes.map((process) => ({
              name: process.name,
              type: process.type,
              workingDirectory: process.workingDirectory || ".",
              executable: process.executable,
              args: parseArguments(process.arguments),
              primary: process.primary,
              public: process.public,
              routes: lines(process.routes),
              hostname:
                !process.primary && process.hostname.trim()
                  ? process.hostname.trim().toLowerCase()
                  : undefined,
              enabled: process.enabled,
              startOrder: Number(process.startOrder),
              instances: Number(process.instances),
              restartDelayMs: Number(process.restartDelayMs),
              inheritEnvironment: process.inheritEnvironment,
              healthPath: process.healthPath.trim() || undefined,
              hostVariable: process.hostVariable.trim() || undefined,
              portVariable: process.portVariable.trim() || undefined,
              environment: parseEnvironment(process.environment),
            }))
          : [];
      await panelApi.createApplication({
        name: form.name,
        nodeId: form.nodeId,
        repository: form.repository || undefined,
        branch: form.branch,
        rootDomain: form.rootDomain,
        domain: form.domain,
        autoDeploy: form.autoDeploy,
        environment: parseEnvironment(form.environment),
        processes,
        additionalHostnames: lines(form.additionalHostnames).map((hostname) =>
          hostname.toLowerCase(),
        ),
        installCommand: parseCommand(form.installCommand),
        buildCommand: parseCommand(form.buildCommand),
        checkCommands: lines(form.checkCommands).map(parseCommand),
        persistentPaths: lines(form.persistentPaths).map((path) => {
          const file = path.startsWith("file:");
          const directory = path.startsWith("directory:");
          return {
            path: (file || directory ? path.slice(path.indexOf(":") + 1) : path).trim(),
            type: file ? "file" : "directory",
          };
        }),
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
        className="modal application-modal"
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
              <span>Hosting region</span>
              <div className="select-wrap">
                <Server size={16} />
                <select
                  required
                  value={form.nodeId}
                  onChange={(event) =>
                    setForm({ ...form, nodeId: event.target.value })
                  }
                >
                  <option value="">Select a hosting region</option>
                  {nodes.map((node) => (
                    <option value={node.id} key={node.id}>
                      {node.region}
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
          <section className="process-setup">
            <div className="process-setup-head">
              <div>
                <h3>PM2 processes</h3>
                <p>Run one automatically detected process or several services from this repository. Web and API ports are assigned automatically.</p>
              </div>
              <label>
                <span>Process setup</span>
                <select
                  value={form.processMode}
                  onChange={(event) =>
                    setForm({ ...form, processMode: event.target.value })
                  }
                >
                  <option value="automatic">Automatic · one process</option>
                  <option value="multiple">Multiple processes</option>
                </select>
              </label>
            </div>

            {form.processMode === "multiple" && (
              <div className="process-list">
                {form.processes.map((process, index) => {
                  const usesPort = ["web", "api"].includes(process.type);
                  return (
                    <section className="process-card" key={`${process.name}-${index}`}>
                      <div className="process-card-head">
                        <div>
                          <b>{process.name || `Process ${index + 1}`}</b>
                          <span>{process.primary ? "Public domain process" : process.type}</span>
                        </div>
                        <button
                          type="button"
                          className="row-action danger-action"
                          onClick={() => removeProcess(index)}
                          disabled={form.processes.length === 1}
                          aria-label={`Remove ${process.name || `process ${index + 1}`}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="form-grid process-grid">
                        <label>
                          <span>Process name</span>
                          <input
                            required
                            value={process.name}
                            onChange={(event) =>
                              updateProcess(index, {
                                name: event.target.value.toLowerCase().replace(/\s+/g, "-"),
                              })
                            }
                            placeholder="api"
                          />
                        </label>
                        <label>
                          <span>Type</span>
                          <select
                            value={process.type}
                            onChange={(event) => {
                              const type = event.target.value;
                              const supportsPort = ["web", "api"].includes(type);
                              updateProcess(index, {
                                type,
                                public: supportsPort ? process.public : false,
                                primary: supportsPort ? process.primary : false,
                                routes: supportsPort ? process.routes : "",
                                hostname: supportsPort ? process.hostname : "",
                              });
                            }}
                          >
                            <option value="web">Web</option>
                            <option value="api">API</option>
                            {!process.primary && <option value="worker">Worker</option>}
                            {!process.primary && <option value="custom">Custom</option>}
                          </select>
                        </label>
                      </div>
                      <label>
                        <span>Working directory</span>
                        <input
                          required
                          value={process.workingDirectory}
                          onChange={(event) =>
                            updateProcess(index, { workingDirectory: event.target.value })
                          }
                          placeholder="V2/Bifrost-API"
                        />
                      </label>
                      <div className="form-grid process-grid">
                        <label>
                          <span>Executable</span>
                          <select
                            value={process.executable}
                            onChange={(event) =>
                              updateProcess(index, { executable: event.target.value })
                            }
                          >
                            {['node', 'npm', 'pnpm', 'yarn', 'bun'].map((executable) => (
                              <option value={executable} key={executable}>{executable}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Arguments</span>
                          <input
                            value={process.arguments}
                            onChange={(event) =>
                              updateProcess(index, { arguments: event.target.value })
                            }
                            placeholder="--env-file-if-exists=.env dist/server.js"
                          />
                        </label>
                      </div>
                      <div className="process-toggles">
                        <label>
                          <input
                            type="checkbox"
                            checked={process.enabled}
                            onChange={(event) => updateProcess(index, { enabled: event.target.checked })}
                          /> Enabled
                        </label>
                        {usesPort && (
                          <label>
                            <input
                              type="checkbox"
                              checked={process.public}
                              disabled={process.primary}
                              onChange={(event) => updateProcess(index, { public: event.target.checked })}
                            /> Public HTTP routing
                          </label>
                        )}
                        {usesPort && (
                          <label>
                            <input
                              type="radio"
                              name="primary-process"
                              checked={process.primary}
                              onChange={() => selectPrimary(index)}
                            /> Main domain process
                          </label>
                        )}
                        <label>
                          <input
                            type="checkbox"
                            checked={process.inheritEnvironment}
                            onChange={(event) => updateProcess(index, { inheritEnvironment: event.target.checked })}
                          /> Inherit shared environment
                        </label>
                      </div>
                      {process.public && (
                        <div className="form-grid process-grid">
                          <label>
                            <span>Routes</span>
                            <textarea
                              value={process.routes}
                              onChange={(event) => updateProcess(index, { routes: event.target.value })}
                              placeholder={'/api\n/health\n/ready'}
                            />
                          </label>
                          <label>
                            <span>Separate hostname (optional)</span>
                            <input
                              value={process.hostname}
                              disabled={process.primary}
                              onChange={(event) => updateProcess(index, { hostname: event.target.value.toLowerCase() })}
                              placeholder={process.primary ? form.domain || "Uses application hostname" : "api.example.com"}
                            />
                          </label>
                        </div>
                      )}
                      <div className="process-runtime-grid">
                        <label><span>Start order</span><input type="number" min="0" max="1000" value={process.startOrder} onChange={(event) => updateProcess(index, { startOrder: event.target.value })} /></label>
                        <label><span>Instances</span><input type="number" min="1" max="32" value={process.instances} onChange={(event) => updateProcess(index, { instances: event.target.value })} /></label>
                        <label><span>Restart delay</span><input type="number" min="0" max="300000" value={process.restartDelayMs} onChange={(event) => updateProcess(index, { restartDelayMs: event.target.value })} /></label>
                        {usesPort && <label><span>Health path</span><input value={process.healthPath} onChange={(event) => updateProcess(index, { healthPath: event.target.value })} placeholder="/health" /></label>}
                        {usesPort && <label><span>Host variable</span><input value={process.hostVariable} onChange={(event) => updateProcess(index, { hostVariable: event.target.value.toUpperCase() })} placeholder="BIFROST_API_HOST" /></label>}
                        {usesPort && <label><span>Port variable</span><input value={process.portVariable} onChange={(event) => updateProcess(index, { portVariable: event.target.value.toUpperCase() })} placeholder="BIFROST_API_PORT" /></label>}
                      </div>
                      <label>
                        <span>Process-only environment variables</span>
                        <textarea
                          className="process-environment"
                          value={process.environment}
                          onChange={(event) => updateProcess(index, { environment: event.target.value })}
                          placeholder="DATABASE_HOST=..."
                          spellCheck="false"
                        />
                      </label>
                    </section>
                  );
                })}
                <button type="button" className="secondary add-process" onClick={addProcess}>
                  <Plus size={15} /> Add process
                </button>
              </div>
            )}
          </section>

          <section className="deployment-advanced">
            <h3>Deployment options</h3>
            <p>Leave commands empty to use automatic repository detection.</p>
            <div className="form-grid">
              <label><span>Install command</span><input value={form.installCommand} onChange={(event) => setForm({ ...form, installCommand: event.target.value })} placeholder="pnpm install --frozen-lockfile" /></label>
              <label><span>Build command</span><input value={form.buildCommand} onChange={(event) => setForm({ ...form, buildCommand: event.target.value })} placeholder="pnpm -r build" /></label>
            </div>
            <label><span>Pre-start checks (one command per line)</span><textarea value={form.checkCommands} onChange={(event) => setForm({ ...form, checkCommands: event.target.value })} placeholder={'pnpm lint\npnpm typecheck\npnpm test'} /></label>
            <div className="form-grid">
              <label><span>Additional hostnames</span><textarea value={form.additionalHostnames} onChange={(event) => setForm({ ...form, additionalHostnames: event.target.value })} placeholder={'bifrost.example.no\nwww.example.com'} /><small>Aliases may use any Cloudflare zone connected to this workspace.</small></label>
              <label><span>Persistent paths</span><textarea value={form.persistentPaths} onChange={(event) => setForm({ ...form, persistentPaths: event.target.value })} placeholder={'file:V2/var/secrets/settings.key\ndirectory:V2/var/uploads'} /></label>
            </div>
          </section>
          <label>
            <span>Shared environment variables</span>
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
