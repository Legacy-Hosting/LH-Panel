import { useEffect, useState } from "react";
import {
  Copy,
  LoaderCircle,
  Plus,
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
    publicIp: "",
    privateIp: "",
    cnameTarget: "",
    region: "",
  });
  const [agent, setAgent] = useState(null);
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

  async function create(event) {
    event.preventDefault();
    setBusy("create");
    setError("");
    try {
      const response = await panelApi.createNode({
        ...form,
        privateIp: form.privateIp || undefined,
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
            <button className="icon-btn" onClick={() => setAgent(null)}>
              <X size={16} />
            </button>
          </div>
          <pre>{environmentText}</pre>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(environmentText);
                feedback.success("Agent environment copied.");
              } catch {
                feedback.error("Could not copy the agent environment.");
              }
            }}
          >
            <Copy size={15} /> Copy environment
          </button>
        </section>
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
            {[
              ["name", "Node name", "ams3-web-01"],
              ["region", "Region", "Amsterdam, NL"],
              ["publicIp", "Public IP", "203.0.113.10"],
              ["privateIp", "Private IP (optional)", "10.0.0.10"],
              ["cnameTarget", "CNAME target", "ams3.web-01.legacyh.fyi"],
            ].map(([key, label, placeholder]) => (
              <label
                key={key}
                className={key === "cnameTarget" ? "wide-field" : ""}
              >
                <span>{label}</span>
                <div className="auth-input">
                  <input
                    required={!["region", "privateIp"].includes(key)}
                    value={form[key]}
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                    placeholder={placeholder}
                  />
                </div>
              </label>
            ))}
          </div>
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
          <div className="resource-row" key={node.id}>
            <div className="resource-symbol">
              <Server size={18} />
            </div>
            <div className="resource-main">
              <b>{node.name}</b>
              <span>
                {node.region || "Unknown region"} · {node.publicIp}
              </span>
            </div>
            <div className="resource-detail">
              <small>CNAME</small>
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
