import { useEffect, useState } from "react";
import { GitBranch, LoaderCircle, Save, X } from "lucide-react";
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

function formatCommand(command) {
  if (!command?.command) return "";
  return [command.command, ...(command.args || [])]
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
      await panelApi.updateApplication(applicationId, {
        name: form.name,
        branch: form.branch,
        autoDeploy: form.autoDeploy,
        installCommand,
        buildCommand,
        checkCommands,
        persistentPaths,
      });
      await onUpdated?.(applicationId);
      feedback.success(
        `${form.name} was updated. Deploy the application to apply runtime changes.`,
      );
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
                <span>{application.hostname}</span>
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
