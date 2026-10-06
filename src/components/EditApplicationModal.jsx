import { useEffect, useState } from "react";
import { GitBranch, LoaderCircle, Plus, Save, Trash2, X } from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "./FeedbackProvider.jsx";

function parseArguments(value) {
  const arguments_ = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g;
  for (const match of value.matchAll(pattern)) {
    arguments_.push(
      (match[1] ?? match[2] ?? match[3]).replace(/\\([\\"'])/g, "$1"),
    );
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

function formatCommand(command) {
  if (!command?.command) return "";
  return [command.command, ...(command.args || [])]
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function formatArguments(arguments_ = []) {
  return arguments_
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

function nonEmptyLines(value) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const emptyForm = {
  name: "",
  branch: "main",
  autoDeploy: true,
  installCommand: "",
  buildCommand: "",
  checkCommands: "",
  persistentPaths: "",
  processes: [],
};

export function EditApplicationModal({ applicationId, onClose, onUpdated }) {
  const feedback = useFeedback();
  const [application, setApplication] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!applicationId) return undefined;
    let active = true;
    setApplication(null);
    setError("");
    panelApi
      .application(applicationId)
      .then((response) => {
        if (!active) return;
        const detail = response.data;
        const runtime = detail.runtime || {};
        setApplication(detail);
        setForm({
          name: detail.name || "",
          branch: detail.branch || "main",
          autoDeploy: Boolean(detail.autoDeploy),
          installCommand: formatCommand(runtime.install),
          buildCommand: formatCommand(runtime.build),
          checkCommands: (runtime.checks || []).map(formatCommand).join("\n"),
          persistentPaths: (detail.persistentPaths || [])
            .map((path) => `${path.type}:${path.path}`)
            .join("\n"),
          processes: (detail.processes || []).map((process) => ({
            ...process,
            editorId: process.id,
            arguments: formatArguments(process.arguments),
            routes: (process.routes || []).join("\n"),
            hostname:
              process.primary || process.hostname === detail.hostname
                ? ""
                : process.hostname || "",
            hostVariable: process.hostVariable || "",
            portVariable: process.portVariable || "",
            healthPath: process.healthPath || "",
            environment: "",
          })),
        });
      })
      .catch((caught) =>
        setError(caught.message || "Could not load application settings"),
      );
    return () => {
      active = false;
    };
  }, [applicationId]);

  if (!applicationId) return null;

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
          editorId: crypto.randomUUID(),
          name: `process-${current.processes.length + 1}`,
          type: "worker",
          workingDirectory: ".",
          executable: "pnpm",
          arguments: "run worker",
          primary: false,
          public: false,
          routes: "",
          hostname: "",
          enabled: true,
          startOrder: current.processes.length,
          instances: 1,
          restartDelayMs: 1000,
          inheritEnvironment: true,
          healthPath: "",
          hostVariable: "",
          portVariable: "",
          environment: "",
          environmentKeys: [],
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

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const installCommand = parseCommand(form.installCommand);
      const buildCommand = parseCommand(form.buildCommand) ?? null;
      const checkCommands = nonEmptyLines(form.checkCommands).map((line) => {
        const command = parseCommand(line);
        if (!command) throw new Error("A pre-start check cannot be empty");
        return command;
      });
      const persistentPaths = nonEmptyLines(form.persistentPaths).map((line) => {
        const file = line.startsWith("file:");
        const directory = line.startsWith("directory:");
        return {
          path: (file || directory
            ? line.slice(line.indexOf(":") + 1)
            : line
          ).trim(),
          type: file ? "file" : "directory",
        };
      });
      const processes = form.processes.map((process) => {
        const environment = parseEnvironment(process.environment);
        return {
          ...(process.id ? { id: process.id } : {}),
          name: process.name,
          type: process.type,
          workingDirectory: process.workingDirectory || ".",
          executable: process.executable,
          args: parseArguments(process.arguments),
          primary: process.primary,
          public: process.public,
          routes: nonEmptyLines(process.routes),
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
          ...(Object.keys(environment).length ? { environment } : {}),
        };
      });
      const result = await panelApi.updateApplication(applicationId, {
        name: form.name,
        branch: form.branch,
        autoDeploy: form.autoDeploy,
        installCommand,
        buildCommand,
        checkCommands,
        persistentPaths,
        processes,
      });
      await onUpdated?.(applicationId);
      feedback.success(
        `${form.name} was updated. Deploy the application to apply runtime changes.`,
      );
      const failedDomains = (result.data?.domains ?? []).filter((domain) => domain.status === "error");
      if (failedDomains.length) {
        feedback.warning(
          `Settings were saved, but DNS/proxy setup failed for ${failedDomains.map((domain) => domain.hostname).join(", ")}. Check the Cloudflare connection and save again to retry.`,
          { duration: 12000 },
        );
      }
      onClose();
    } catch (caught) {
      const message = caught.message || "Could not update application";
      setError(message);
      feedback.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal application-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-application-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="edit-application-title">Edit application</h2>
            <p>
              Update deployment settings without replacing stored environment
              secrets.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!application && !error ? (
          <div className="modal-loading">
            <LoaderCircle className="spin" size={20} /> Loading settings…
          </div>
        ) : (
          <form className="application-form" onSubmit={submit}>
            {error && <div className="data-error">{error}</div>}
            {application && (
              <div className="application-edit-context">
                <span>{application.hostname || "Internal background application"}</span>
                <b>{application.repository || "Manual application"}</b>
              </div>
            )}
            <div className="form-grid">
              <label>
                <span>Application name</span>
                <input
                  required
                  minLength="2"
                  maxLength="80"
                  pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value
                        .toLowerCase()
                        .replace(/\s+/g, "-"),
                    })
                  }
                />
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
                  <p>
                    Edit, add, or remove services. Web and API ports remain
                    auto-assigned; deploy after saving to apply changes.
                  </p>
                </div>
              </div>
              <div className="process-list">
                {form.processes.map((process, index) => {
                  const usesPort = ["web", "api"].includes(process.type);
                  return (
                    <section className="process-card" key={process.editorId}>
                      <div className="process-card-head">
                        <div>
                          <b>{process.name || `Process ${index + 1}`}</b>
                          <span>
                            {process.primary
                              ? "Public domain process"
                              : process.type}
                          </span>
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
                                name: event.target.value
                                  .toLowerCase()
                                  .replace(/\s+/g, "-"),
                              })
                            }
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
                            {!process.primary && <option value="bot">Bot</option>}
                            {!process.primary && (
                              <option value="worker">Worker</option>
                            )}
                            {!process.primary && (
                              <option value="custom">Custom</option>
                            )}
                          </select>
                        </label>
                      </div>
                      <label>
                        <span>Working directory</span>
                        <input
                          required
                          value={process.workingDirectory}
                          onChange={(event) =>
                            updateProcess(index, {
                              workingDirectory: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="form-grid process-grid">
                        <label>
                          <span>Executable</span>
                          <select
                            value={process.executable}
                            onChange={(event) =>
                              updateProcess(index, {
                                executable: event.target.value,
                              })
                            }
                          >
                            {["node", "npm", "pnpm", "yarn", "bun"].map(
                              (executable) => (
                                <option value={executable} key={executable}>
                                  {executable}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label>
                          <span>Arguments</span>
                          <input
                            value={process.arguments}
                            onChange={(event) =>
                              updateProcess(index, {
                                arguments: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="process-toggles">
                        <label>
                          <input
                            type="checkbox"
                            checked={process.enabled}
                            onChange={(event) =>
                              updateProcess(index, {
                                enabled: event.target.checked,
                              })
                            }
                          />{" "}
                          Enabled
                        </label>
                        {usesPort && (
                          <label>
                            <input
                              type="checkbox"
                              checked={process.public}
                              disabled={process.primary}
                              onChange={(event) =>
                                updateProcess(index, {
                                  public: event.target.checked,
                                })
                              }
                            />{" "}
                            Public HTTP routing
                          </label>
                        )}
                        {usesPort && (
                          <label>
                            <input
                              type="radio"
                              name="edit-primary-process"
                              checked={process.primary}
                              onChange={() => selectPrimary(index)}
                            />{" "}
                            Main domain process
                          </label>
                        )}
                        <label>
                          <input
                            type="checkbox"
                            checked={process.inheritEnvironment}
                            onChange={(event) =>
                              updateProcess(index, {
                                inheritEnvironment: event.target.checked,
                              })
                            }
                          />{" "}
                          Inherit shared environment
                        </label>
                      </div>
                      {process.public && (
                        <div className="form-grid process-grid">
                          <label>
                            <span>Routes</span>
                            <textarea
                              value={process.routes}
                              onChange={(event) =>
                                updateProcess(index, {
                                  routes: event.target.value,
                                })
                              }
                              placeholder={"/api/*\n/health\n/ready"}
                            />
                          </label>
                          <label>
                            <span>Separate hostname (optional)</span>
                            <input
                              value={process.hostname}
                              disabled={process.primary}
                              onChange={(event) =>
                                updateProcess(index, {
                                  hostname: event.target.value.toLowerCase(),
                                })
                              }
                              placeholder={
                                process.primary
                                  ? application?.hostname ||
                                    "Uses application hostname"
                                  : "api.example.com"
                              }
                            />
                            {!process.primary && <small>Use a full hostname in a connected Cloudflare zone. DNS and HTTPS routing are configured when you save an enabled process.</small>}
                          </label>
                        </div>
                      )}
                      <div className="process-runtime-grid">
                        <label>
                          <span>Start order</span>
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            value={process.startOrder}
                            onChange={(event) =>
                              updateProcess(index, {
                                startOrder: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Instances</span>
                          <input
                            type="number"
                            min="1"
                            max="32"
                            value={process.instances}
                            onChange={(event) =>
                              updateProcess(index, {
                                instances: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <span>Restart delay</span>
                          <input
                            type="number"
                            min="0"
                            max="300000"
                            value={process.restartDelayMs}
                            onChange={(event) =>
                              updateProcess(index, {
                                restartDelayMs: event.target.value,
                              })
                            }
                          />
                        </label>
                        {usesPort && (
                          <label>
                            <span>Health path</span>
                            <input
                              value={process.healthPath}
                              onChange={(event) =>
                                updateProcess(index, {
                                  healthPath: event.target.value,
                                })
                              }
                              placeholder="/health"
                            />
                          </label>
                        )}
                        {usesPort && (
                          <label>
                            <span>Host variable</span>
                            <input
                              value={process.hostVariable}
                              onChange={(event) =>
                                updateProcess(index, {
                                  hostVariable: event.target.value.toUpperCase(),
                                })
                              }
                            />
                          </label>
                        )}
                        {usesPort && (
                          <label>
                            <span>Port variable</span>
                            <input
                              value={process.portVariable}
                              onChange={(event) =>
                                updateProcess(index, {
                                  portVariable: event.target.value.toUpperCase(),
                                })
                              }
                            />
                          </label>
                        )}
                      </div>
                      <label>
                        <span>Replace or add process-only secrets</span>
                        <textarea
                          className="process-environment"
                          value={process.environment}
                          onChange={(event) =>
                            updateProcess(index, {
                              environment: event.target.value,
                            })
                          }
                          placeholder="DATABASE_HOST=..."
                          spellCheck="false"
                        />
                        <small>
                          Existing values are preserved. Stored keys: {" "}
                          {process.environmentKeys?.length
                            ? process.environmentKeys.join(", ")
                            : "none"}
                        </small>
                      </label>
                    </section>
                  );
                })}
                <button
                  type="button"
                  className="secondary add-process"
                  onClick={addProcess}
                >
                  <Plus size={15} /> Add process
                </button>
              </div>
            </section>

            <section className="deployment-advanced">
              <h3>Deployment options</h3>
              <p>Runtime changes take effect on the next deployment.</p>
              <div className="form-grid">
                <label>
                  <span>Install command</span>
                  <input
                    required={Boolean(application?.repository)}
                    value={form.installCommand}
                    onChange={(event) =>
                      setForm({ ...form, installCommand: event.target.value })
                    }
                    placeholder="pnpm install --frozen-lockfile"
                  />
                </label>
                <label>
                  <span>Build command</span>
                  <input
                    value={form.buildCommand}
                    onChange={(event) =>
                      setForm({ ...form, buildCommand: event.target.value })
                    }
                    placeholder="pnpm build"
                  />
                </label>
              </div>
              <label>
                <span>Pre-start checks (one command per line)</span>
                <textarea
                  value={form.checkCommands}
                  onChange={(event) =>
                    setForm({ ...form, checkCommands: event.target.value })
                  }
                  placeholder={"pnpm lint\npnpm test"}
                />
              </label>
              <label>
                <span>Persistent paths</span>
                <textarea
                  value={form.persistentPaths}
                  onChange={(event) =>
                    setForm({ ...form, persistentPaths: event.target.value })
                  }
                  placeholder={
                    "file:V2/var/secrets/settings.key\ndirectory:V2/var/uploads"
                  }
                />
              </label>
            </section>

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
                <small>Only pushes to {form.branch || "the selected branch"}.</small>
              </span>
            </label>

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="primary" disabled={busy || !application}>
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
