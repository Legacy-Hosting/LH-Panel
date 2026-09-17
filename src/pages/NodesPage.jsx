import { useEffect, useState } from "react";
import {
  Copy,
  LoaderCircle,
  Plus,
  Rocket,
  RotateCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "../components/FeedbackProvider.jsx";

export function NodesPage() {
  const feedback = useFeedback();
  const [nodes, setNodes] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    publicFqdn: "",
    publicIpv4: "",
    publicIpv6: "",
    privateFqdn: "",
    privateIpv4: "",
    privateIpv6: "",
    cnameTarget: "",
    region: "",
  });
  const [agent, setAgent] = useState(null);
  const [showAutoDeploy, setShowAutoDeploy] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await panelApi.nodes();
      setNodes(response.data);
    } catch (caught) {
      setError(caught.message || "Could not load nodes");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!showAutoDeploy) return undefined;
    const closeWithEscape = (event) => {
      if (event.key === "Escape") setShowAutoDeploy(false);
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [showAutoDeploy]);

  async function create(event) {
    event.preventDefault();
    setBusy("create");
    setError("");
    try {
      const response = await panelApi.createNode({
        ...form,
        publicIpv4: form.publicIpv4 || undefined,
        publicIpv6: form.publicIpv6 || undefined,
        privateFqdn: form.privateFqdn || undefined,
        privateIpv4: form.privateIpv4 || undefined,
        privateIpv6: form.privateIpv6 || undefined,
        region: form.region || undefined,
      });
      setAgent(response.data.agent);
      setShowForm(false);
      feedback.success(`${form.name} was created.`);
      await load();
    } catch (caught) {
      feedback.error(caught.message || "Could not create node");
    } finally {
      setBusy("");
    }
  }

  async function rotate(node) {
    const approved = await feedback.confirm({
      title: `Rotate token for ${node.name}?`,
      message: "The existing agent will disconnect immediately.",
      confirmLabel: "Rotate token",
      tone: "warning",
    });
    if (!approved) return;
    setBusy(node.id);
    setError("");
    try {
      const response = await panelApi.rotateNodeToken(node.id);
      setAgent(response.data);
      feedback.warning(`Agent token for ${node.name} was rotated.`);
    } catch (caught) {
      feedback.error(caught.message || "Could not rotate node token");
    } finally {
      setBusy("");
    }
  }

  async function remove(node) {
    const approved = await feedback.confirm({
      title: `Delete ${node.name}?`,
      message: "The node can only be deleted when no applications use it.",
      confirmLabel: "Delete node",
    });
    if (!approved) return;
    setBusy(node.id);
    setError("");
    try {
      await panelApi.deleteNode(node.id);
      feedback.success(`${node.name} was deleted.`);
      await load();
    } catch (caught) {
      feedback.error(caught.message || "Could not delete node");
    } finally {
      setBusy("");
    }
  }

  const environmentText = agent
    ? Object.entries(agent.environment)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")
    : "";

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      feedback.success(successMessage);
    } catch {
      feedback.error("Could not copy to the clipboard.");
    }
  }

  return (
    <div className="resource-page">
      <div className="resource-heading">
        <div>
          <h2>Nodes</h2>
          <p>PM2 servers connected to this workspace.</p>
        </div>
        <button className="primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Add node
        </button>
      </div>
      {error && <div className="data-error">{error}</div>}
      {agent && (
        <section className="one-time-secret">
          <div className="secret-head">
            <div>
              <h3>Agent configuration</h3>
              <p>
                This token is shown once. Add these values to the node
                agent&apos;s protected .env file.
              </p>
            </div>
            <button
              className="icon-btn"
              onClick={() => {
                setShowAutoDeploy(false);
                setAgent(null);
              }}
              aria-label="Close agent configuration"
            >
              <X size={16} />
            </button>
          </div>
          <pre>{environmentText}</pre>
          <div className="secret-actions">
            <button
              className="secondary"
              onClick={() =>
                copyText(environmentText, "Agent environment copied.")
              }
            >
              <Copy size={15} /> Copy environment
            </button>
            <button
              className="primary"
              onClick={() => setShowAutoDeploy(true)}
            >
              <Rocket size={15} /> Auto deploy
            </button>
          </div>
        </section>
      )}
      {agent && showAutoDeploy && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAutoDeploy(false);
          }}
        >
          <section
            className="modal auto-deploy-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auto-deploy-title"
          >
            <div className="modal-head">
              <div>
                <h2 id="auto-deploy-title">Auto deploy command</h2>
                <p>Install and connect the Legacy Hosting agent.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowAutoDeploy(false)}
                aria-label="Close auto deploy dialog"
              >
                <X size={17} />
              </button>
            </div>
            <div className="deploy-type-block">
              <b>Type</b>
              <div className="deploy-type-options">
                <button type="button" className="active">
                  Standalone
                </button>
                <button
                  type="button"
                  disabled
                  title="Docker support is planned"
                >
                  Docker <small>Planned</small>
                </button>
              </div>
              <p>
                Standalone installs the agent directly on a fresh Ubuntu node.
              </p>
            </div>
            <div className="deploy-command-section">
              <b>Run this command on the node:</b>
              <div className="deploy-command">
                <code>{agent.installCommand}</code>
                <button
                  type="button"
                  onClick={() =>
                    copyText(agent.installCommand, "Auto deploy command copied.")
                  }
                  aria-label="Copy auto deploy command"
                  title="Copy command"
                >
                  <Copy size={18} />
                </button>
              </div>
            </div>
            <div className="deploy-warning">
              The command contains the one-time node token. Run it as a
              sudo-capable user on the intended server only, then remove it
              from your shell history.
            </div>
          </section>
        </div>
      )}
      {showForm && (
        <form className="settings-card node-form" onSubmit={create}>
          <div className="settings-card-head">
            <div className="integration-icon access-icon">
              <Server size={20} />
            </div>
            <div>
              <h3>Add node</h3>
              <p>
                The CNAME target is used for every application assigned to this
                node.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>Node name</span>
              <div className="auth-input">
                <input
                  required
                  minLength="2"
                  maxLength="80"
                  pattern="[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                  title="Use lowercase letters, numbers, and hyphens only"
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value.toLowerCase(),
                    })
                  }
                  placeholder="ams3-web-01"
                />
              </div>
            </label>
            <label>
              <span>Region</span>
              <div className="auth-input">
                <input
                  value={form.region}
                  onChange={(event) =>
                    setForm({ ...form, region: event.target.value })
                  }
                  placeholder="Amsterdam, NL"
                />
              </div>
            </label>
          </div>

          <section className="node-form-section">
            <div className="node-form-section-head">
              <h4>Public network</h4>
              <p>A public FQDN and at least one public IP are required.</p>
            </div>
            <div className="form-grid">
              <label className="wide-field">
                <span>Public FQDN</span>
                <div className="auth-input">
                  <input
                    required
                    value={form.publicFqdn}
                    onChange={(event) => {
                      const publicFqdn = event.target.value.toLowerCase();
                      setForm({
                        ...form,
                        publicFqdn,
                        cnameTarget:
                          !form.cnameTarget ||
                          form.cnameTarget === form.publicFqdn
                            ? publicFqdn
                            : form.cnameTarget,
                      });
                    }}
                    placeholder="ams3.web-01.legacyh.fyi"
                  />
                </div>
              </label>
              <label>
                <span>Public IPv4</span>
                <div className="auth-input">
                  <input
                    required={!form.publicIpv6}
                    value={form.publicIpv4}
                    onChange={(event) =>
                      setForm({ ...form, publicIpv4: event.target.value })
                    }
                    placeholder="203.0.113.10"
                  />
                </div>
              </label>
              <label>
                <span>Public IPv6</span>
                <div className="auth-input">
                  <input
                    required={!form.publicIpv4}
                    value={form.publicIpv6}
                    onChange={(event) =>
                      setForm({ ...form, publicIpv6: event.target.value })
                    }
                    placeholder="2001:db8::10"
                  />
                </div>
              </label>
            </div>
          </section>

          <section className="node-form-section">
            <div className="node-form-section-head">
              <h4>Private network</h4>
              <p>Optional addresses used inside your private network.</p>
            </div>
            <div className="form-grid">
              <label className="wide-field">
                <span>Private FQDN (optional)</span>
                <div className="auth-input">
                  <input
                    value={form.privateFqdn}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        privateFqdn: event.target.value.toLowerCase(),
                      })
                    }
                    placeholder="ams3.web-01.internal.legacyh.fyi"
                  />
                </div>
              </label>
              <label>
                <span>Private IPv4 (optional)</span>
                <div className="auth-input">
                  <input
                    value={form.privateIpv4}
                    onChange={(event) =>
                      setForm({ ...form, privateIpv4: event.target.value })
                    }
                    placeholder="10.0.0.10"
                  />
                </div>
              </label>
              <label>
                <span>Private IPv6 (optional)</span>
                <div className="auth-input">
                  <input
                    value={form.privateIpv6}
                    onChange={(event) =>
                      setForm({ ...form, privateIpv6: event.target.value })
                    }
                    placeholder="fd00::10"
                  />
                </div>
              </label>
            </div>
          </section>

          <section className="node-form-section node-dns-section">
            <div className="node-form-section-head">
              <h4>Application DNS</h4>
              <p>Customer domains will use this hostname as their CNAME.</p>
            </div>
            <label>
              <span>CNAME target</span>
              <div className="auth-input">
                <input
                  required
                  value={form.cnameTarget}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      cnameTarget: event.target.value.toLowerCase(),
                    })
                  }
                  placeholder="ams3.web-01.legacyh.fyi"
                />
              </div>
            </label>
          </section>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy === "create"}>
              {busy === "create" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Plus size={16} />
              )}{" "}
              Create node
            </button>
          </div>
        </form>
      )}
      <div className="resource-list">
        {nodes.length === 0 && (
          <div className="empty-row">No nodes have been added.</div>
        )}
        {nodes.map((node) => (
          <div className="resource-row node-resource-row" key={node.id}>
            <div className="resource-symbol">
              <Server size={18} />
            </div>
            <div className="resource-main">
              <b>{node.name}</b>
              <span>
                {node.region || "Unknown region"} · {node.publicFqdn}
              </span>
            </div>
            <div className="resource-detail">
              <small>Public IP</small>
              <b>{node.publicIpv4 || "No IPv4"}</b>
              <span>{node.publicIpv6 || "No IPv6"}</span>
            </div>
            <div className="resource-detail">
              <small>Private network</small>
              <b>{node.privateFqdn || "No private FQDN"}</b>
              <span>
                {[node.privateIpv4, node.privateIpv6]
                  .filter(Boolean)
                  .join(" · ") || "No private IP"}
              </span>
            </div>
            <div className="resource-detail">
              <small>CNAME target</small>
              <b>{node.cnameTarget}</b>
            </div>
            <div className="resource-detail">
              <small>Status</small>
              <b
                className={
                  node.status === "online" ? "online-text" : "muted-text"
                }
              >
                {node.status}
              </b>
            </div>
            <button
              className="row-action"
              onClick={() => rotate(node)}
              disabled={busy === node.id}
              title="Rotate token"
            >
              {busy === node.id ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <RotateCw size={15} />
              )}
            </button>
            <button
              className="row-action danger-action"
              onClick={() => remove(node)}
              title="Delete node"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
