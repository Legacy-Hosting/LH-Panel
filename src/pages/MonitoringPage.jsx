import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Gauge,
  HeartPulse,
  LoaderCircle,
  RefreshCw,
  Save,
  Server,
  TriangleAlert,
} from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "../components/FeedbackProvider.jsx";

const colors = ["#7c5cff", "#36d399", "#4aa8ff", "#f59e0b"];

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayDate(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Oslo",
  }).format(new Date(value));
}

function formatMetric(value, unit) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "—";
  const amount = Number(value);
  if (unit === "bytes") {
    if (amount < 1024 * 1024 * 1024)
      return `${(amount / (1024 * 1024)).toFixed(1)} MB`;
    return `${(amount / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${amount.toFixed(unit === "%" ? 1 : 2)}${unit}`;
}

function MetricChart({ title, subtitle, points, lines, unit = "" }) {
  const width = 640;
  const height = 190;
  const padding = 22;
  const values = lines.flatMap((line) =>
    points.map((point) => Number(point[line.key])).filter(Number.isFinite),
  );
  const maximum = Math.max(...values, unit === "%" ? 100 : 1);
  const minimum = unit === "%" ? 0 : Math.min(...values, 0);
  const range = Math.max(maximum - minimum, 1);
  const x = (index) =>
    padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
  const y = (value) =>
    height - padding - ((Number(value) - minimum) / range) * (height - padding * 2);

  return (
    <section className="monitor-chart-card">
      <div className="monitor-chart-head">
        <div><h3>{title}</h3><p>{subtitle}</p></div>
        <div className="chart-legend">
          {lines.map((line, index) => (
            <span key={line.key}><i style={{ background: line.color || colors[index] }}></i>{line.label}</span>
          ))}
        </div>
      </div>
      {points.length < 2 ? (
        <div className="chart-empty">Waiting for enough metric samples to draw this graph.</div>
      ) : (
        <>
          <svg className="metric-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label={title}>
            {[0, 1, 2, 3].map((line) => (
              <line key={line} x1={padding} x2={width - padding} y1={padding + line * 48} y2={padding + line * 48} className="chart-grid-line" />
            ))}
            {lines.map((line, lineIndex) => {
              const path = points
                .map((point, index) => {
                  const value = Number(point[line.key]);
                  return Number.isFinite(value) ? `${index ? "L" : "M"}${x(index)},${y(value)}` : "";
                })
                .filter(Boolean)
                .join(" ");
              return <path key={line.key} d={path} fill="none" stroke={line.color || colors[lineIndex]} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          <div className="chart-latest">
            {lines.map((line, index) => (
              <span key={line.key}>{line.label} <b>{formatMetric(points.at(-1)?.[line.key], line.unit ?? unit)}</b></span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function LimitInput({ label, unit, value, onChange, inherited }) {
  return (
    <label className="monitor-field">
      <span>{label}</span>
      <div className="unit-input">
        <input type="number" min="0" step="0.1" value={value ?? ""} placeholder={inherited ?? "Unlimited"} onChange={(event) => onChange(numberOrNull(event.target.value))} />
        <small>{unit}</small>
      </div>
    </label>
  );
}

function ApplicationMonitorCard({ application, canWrite, canManage, onChange, onSave, busy }) {
  const hasHttpEndpoint = Boolean(application.hostname);
  const updateHealth = (key, value) => onChange({ ...application, health: { ...application.health, [key]: value } });
  const updateLimit = (key, value) => onChange({ ...application, limits: { ...application.limits, [key]: value } });
  const webhook = application.webhook ?? { enabled: false, configured: false, secretConfigured: false };
  const updateWebhook = (key, value) => onChange({ ...application, webhook: { ...webhook, [key]: value } });
  return (
    <section className="settings-card monitor-app-card">
      <div className="monitor-app-head">
        <span className={`health-dot ${application.health.status}`}></span>
        <div><h3>{application.name}</h3><p>{application.hostname || "Internal background application"}</p></div>
        <span className={`health-state ${application.health.status}`}>{application.health.status}</span>
      </div>
      <div className="monitor-usage-strip">
        <span>CPU <b>{application.usage.cpuPercent.toFixed(1)}%</b></span>
        <span>Memory <b>{application.usage.memoryMb.toFixed(0)} MB</b></span>
        <span>Storage <b>{application.usage.storageGb.toFixed(2)} GB</b></span>
        <span>Traffic <b>{application.usage.monthlyTrafficGb.toFixed(2)} GB</b></span>
      </div>
      <div className="health-config-grid">
        <label className="monitor-check"><input type="checkbox" checked={application.health.enabled} disabled={!canWrite || !hasHttpEndpoint} onChange={(event) => updateHealth("enabled", event.target.checked)} /><span>{hasHttpEndpoint ? "HTTP health check" : "PM2 process monitoring"}</span></label>
        <label className="monitor-field wide-monitor-field"><span>Path</span><input value={application.health.path} disabled={!canWrite || !hasHttpEndpoint} onChange={(event) => updateHealth("path", event.target.value)} /></label>
        <label className="monitor-field"><span>Interval</span><div className="unit-input"><input type="number" min="15" max="3600" value={application.health.intervalSeconds} disabled={!canWrite || !hasHttpEndpoint} onChange={(event) => updateHealth("intervalSeconds", Number(event.target.value))} /><small>sec</small></div></label>
        <label className="monitor-field"><span>Timeout</span><div className="unit-input"><input type="number" min="500" max="30000" value={application.health.timeoutMs} disabled={!canWrite || !hasHttpEndpoint} onChange={(event) => updateHealth("timeoutMs", Number(event.target.value))} /><small>ms</small></div></label>
        <label className="monitor-field"><span>Expected HTTP</span><div className="status-range"><input type="number" min="100" max="599" value={application.health.expectedStatusMin} disabled={!canWrite || !hasHttpEndpoint} onChange={(event) => updateHealth("expectedStatusMin", Number(event.target.value))} /><i>–</i><input type="number" min="100" max="599" value={application.health.expectedStatusMax} disabled={!canWrite || !hasHttpEndpoint} onChange={(event) => updateHealth("expectedStatusMax", Number(event.target.value))} /></div></label>
      </div>
      <div className="monitor-last-check">
        {hasHttpEndpoint ? <>Last check: <b>{displayDate(application.health.lastCheckedAt)}</b></> : <>Availability is read directly from the PM2 process on the assigned node.</>}
        {application.health.lastResponseMs !== null && <> · {application.health.lastResponseMs} ms</>}
        {application.health.lastHttpStatus !== null && <> · HTTP {application.health.lastHttpStatus}</>}
        {application.health.lastError && <span>{application.health.lastError}</span>}
      </div>
      <div className="limit-grid">
        <LimitInput label="CPU override" unit="%" value={application.limits.cpuPercent} inherited={application.effectiveLimits.cpuPercent ? `Plan: ${application.effectiveLimits.cpuPercent}` : undefined} onChange={(value) => updateLimit("cpuPercent", value)} />
        <LimitInput label="Memory override" unit="MB" value={application.limits.memoryMb} inherited={application.effectiveLimits.memoryMb ? `Plan: ${application.effectiveLimits.memoryMb}` : undefined} onChange={(value) => updateLimit("memoryMb", value)} />
        <LimitInput label="Storage override" unit="GB" value={application.limits.storageGb} inherited={application.effectiveLimits.storageGb ? `Plan: ${application.effectiveLimits.storageGb}` : undefined} onChange={(value) => updateLimit("storageGb", value)} />
        <LimitInput label="Traffic override" unit="GB/mo" value={application.limits.monthlyTrafficGb} inherited={application.effectiveLimits.monthlyTrafficGb ? `Plan: ${application.effectiveLimits.monthlyTrafficGb}` : undefined} onChange={(value) => updateLimit("monthlyTrafficGb", value)} />
      </div>
      <div className="application-webhook">
        <div>
          <h4>Application webhook</h4>
          <p>Alert events from this application are delivered only to this endpoint.</p>
        </div>
        <label className="monitor-check"><input type="checkbox" checked={webhook.enabled} disabled={!canManage} onChange={(event) => updateWebhook("enabled", event.target.checked)} /><span>Signed webhook enabled</span></label>
        <label className="monitor-field wide-monitor-field"><span>HTTPS endpoint</span><input type="url" disabled={!canManage} placeholder={webhook.configured ? "Webhook configured — leave blank to keep" : "https://hooks.example.com/application"} value={webhook.url ?? ""} onChange={(event) => updateWebhook("url", event.target.value || undefined)} /></label>
        <label className="monitor-field wide-monitor-field"><span>Signing secret</span><input type="password" minLength="16" disabled={!canManage} placeholder={webhook.secretConfigured ? "Signing secret configured — leave blank to keep" : "Minimum 16 characters"} value={webhook.secret ?? ""} onChange={(event) => updateWebhook("secret", event.target.value || undefined)} /></label>
        {!canManage && <small>Only owners and administrators can change webhook delivery.</small>}
      </div>
      {canWrite && <button className="secondary monitor-save" onClick={() => onSave(application)} disabled={busy === application.id}>{busy === application.id ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} Save application monitoring</button>}
    </section>
  );
}

export function MonitoringPage({ team, infrastructure = false }) {
  const feedback = useFeedback();
  const [summary, setSummary] = useState({ activeAlerts: 0, offlineNodes: 0, failedApplications: 0, unhealthyChecks: 0 });
  const [nodes, setNodes] = useState([]);
  const [applications, setApplications] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [recipientText, setRecipientText] = useState("");
  const [selection, setSelection] = useState("");
  const [range, setRange] = useState("24h");
  const [series, setSeries] = useState({ points: [], health: [] });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const canManage = ["owner", "administrator"].includes(team?.role);
  const canWrite = canManage || team?.role === "developer";

  async function load() {
    setError("");
    try {
      const nodeRequest = infrastructure
        ? panelApi.nodes()
        : Promise.resolve({ data: [] });
      const applicationRequest = infrastructure
        ? Promise.resolve({ data: [] })
        : panelApi.monitoredApplications();
      const [summaryResponse, nodeResponse, applicationResponse, alertResponse, settingsResponse] = await Promise.all([
        panelApi.monitoringSummary(), nodeRequest, applicationRequest, panelApi.monitoringAlerts(), panelApi.monitoringSettings(),
      ]);
      setSummary(summaryResponse.data);
      setNodes(nodeResponse.data);
      setApplications(applicationResponse.data);
      setAlerts(
        alertResponse.data.filter((alert) =>
          infrastructure
            ? alert.resourceType === "node"
            : alert.resourceType !== "node",
        ),
      );
      setSettings({ ...settingsResponse.data, webhookUrl: undefined, webhookSecret: undefined });
      setRecipientText(settingsResponse.data.emailRecipients.join(", "));
      setSelection((current) =>
        current ||
        (infrastructure && nodeResponse.data[0]
          ? `node:${nodeResponse.data[0].id}`
          : applicationResponse.data[0]
            ? `application:${applicationResponse.data[0].id}`
            : ""),
      );
    } catch (caught) {
      setError(caught.message || "Could not load monitoring data");
    }
  }

  useEffect(() => { load(); }, [infrastructure]);
  useEffect(() => {
    if (!selection) return;
    const [scope, resourceId] = selection.split(":");
    let active = true;
    panelApi.monitoringTimeseries(scope, resourceId, range)
      .then((response) => { if (active) setSeries(response.data); })
      .catch((caught) => { if (active) setError(caught.message || "Could not load metric history"); });
    return () => { active = false; };
  }, [selection, range]);

  const selectedScope = selection.split(":")[0];
  const applicationPoints = useMemo(() => series.points?.map((point) => ({
    ...point,
    memoryGb: Number(point.memoryBytes ?? 0) / (1024 ** 3),
    storageGb: Number(point.storageBytes ?? 0) / (1024 ** 3),
    trafficMb: Number(point.trafficBytes ?? 0) / (1024 ** 2),
  })) ?? [], [series]);

  async function saveSettings(event) {
    event.preventDefault();
    setBusy("settings"); setError("");
    try {
      await panelApi.updateMonitoringSettings({
        ...settings,
        emailRecipients: recipientText.split(",").map((item) => item.trim()).filter(Boolean),
      });
      feedback.success("Monitoring settings saved.");
      await load();
    } catch (caught) { feedback.error(caught.message || "Could not save monitoring settings"); }
    finally { setBusy(""); }
  }

  function updateApplication(updated) {
    setApplications((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  async function saveApplication(application) {
    setBusy(application.id); setError("");
    try {
      await panelApi.updateApplicationMonitoring(application.id, {
        health: application.health,
        limits: application.limits,
        ...(canManage ? {
          webhook: {
            enabled: Boolean(application.webhook?.enabled),
            ...(application.webhook?.url !== undefined ? { url: application.webhook.url } : {}),
            ...(application.webhook?.secret !== undefined ? { secret: application.webhook.secret } : {}),
          },
        } : {}),
      });
      feedback.success(`${application.name} monitoring saved.`);
      const response = await panelApi.monitoredApplications();
      setApplications(response.data);
    } catch (caught) { feedback.error(caught.message || "Could not save application monitoring"); }
    finally { setBusy(""); }
  }

  return (
    <div className="monitoring-page">
      <div className="resource-heading monitor-title">
        <div>
          <h2>{infrastructure ? "Infrastructure monitoring" : "Application monitoring"}</h2>
          <p>
            {infrastructure
              ? "Internal node health, capacity, and infrastructure alerts."
              : "Application health, historical metrics, limits, and alert delivery."}
          </p>
        </div>
        <button className="secondary" onClick={load}><RefreshCw size={15} /> Refresh</button>
      </div>
      {error && <div className="data-error">{error}</div>}

      <div className="monitor-summary">
        {(infrastructure
          ? [
              ["Active alerts", summary.activeAlerts, BellRing],
              ["Offline nodes", summary.offlineNodes, Server],
            ]
          : [
              ["Active alerts", summary.activeAlerts, BellRing],
              ["Failed processes", summary.failedApplications, Gauge],
              ["Unhealthy checks", summary.unhealthyChecks, HeartPulse],
            ]
        ).map(([label, value, Icon]) => <div className="monitor-summary-card" key={label}><Icon size={18} /><span><small>{label}</small><b>{value}</b></span></div>)}
      </div>

      <section className="monitor-toolbar">
        <div><h3>Metric history</h3><p>Samples are aggregated to a useful resolution for the selected period.</p></div>
        <select value={selection} onChange={(event) => setSelection(event.target.value)}>
          {infrastructure
            ? nodes.map((node) => <option value={`node:${node.id}`} key={node.id}>{node.name}</option>)
            : applications.map((application) => <option value={`application:${application.id}`} key={application.id}>{application.name}</option>)}
        </select>
        <select value={range} onChange={(event) => setRange(event.target.value)}><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select>
      </section>

      <div className="monitor-chart-grid">
        {selectedScope === "node" ? <>
          <MetricChart title="Memory and disk" subtitle="Node utilization" points={series.points ?? []} lines={[{ key: "memoryPercent", label: "Memory" }, { key: "diskPercent", label: "Disk" }]} unit="%" />
          <MetricChart title="Load average" subtitle="One-minute load average" points={series.points ?? []} lines={[{ key: "load1", label: "Load", unit: "" }]} />
          <MetricChart title="Network counters" subtitle="Cumulative bytes across non-loopback interfaces" points={series.points ?? []} lines={[{ key: "networkReceivedBytes", label: "Received", unit: "bytes" }, { key: "networkSentBytes", label: "Sent", unit: "bytes" }]} />
        </> : <>
          <MetricChart title="Process utilization" subtitle="PM2 CPU over time" points={applicationPoints} lines={[{ key: "cpuPercent", label: "CPU" }]} unit="%" />
          <MetricChart title="Memory and storage" subtitle="Application resource use" points={applicationPoints} lines={[{ key: "memoryGb", label: "Memory", unit: " GB" }, { key: "storageGb", label: "Storage", unit: " GB" }]} />
          <MetricChart title="HTTP health" subtitle="Response time and availability samples" points={series.health ?? []} lines={[{ key: "responseMs", label: "Response", unit: " ms" }, { key: "uptimePercent", label: "Uptime", unit: "%" }]} />
        </>}
      </div>

      {!infrastructure && <>
        <div className="monitor-section-heading"><div><h2>Application policies</h2><p>Health checks and overrides; empty limits inherit the workspace plan.</p></div></div>
        <div className="monitor-app-grid">
          {applications.map((application) => <ApplicationMonitorCard key={application.id} application={application} canWrite={canWrite} canManage={canManage} onChange={updateApplication} onSave={saveApplication} busy={busy} />)}
          {applications.length === 0 && <div className="empty-row">No applications available for monitoring.</div>}
        </div>
      </>}

      <div className="monitor-bottom-grid">
        <section className="settings-card alert-history">
          <div className="settings-card-head"><div className="integration-icon access-icon"><TriangleAlert size={20} /></div><div><h3>Alert history</h3><p>Current and recently resolved incidents</p></div></div>
          <div className="alert-list">
            {alerts.length === 0 && <div className="settings-empty">No monitoring alerts.</div>}
            {alerts.map((alert) => <div className={`alert-row ${alert.active ? "active" : "resolved"}`} key={alert.id}><span><b>{alert.title}</b><small>{alert.message}</small></span><time>{alert.active ? "Active" : `Resolved ${displayDate(alert.resolvedAt)}`}</time></div>)}
          </div>
        </section>

        {settings && <form className="settings-card monitoring-settings" onSubmit={saveSettings}>
          <div className="settings-card-head"><div className="integration-icon cloudflare-icon"><BellRing size={20} /></div><div><h3>Rules and delivery</h3><p>Workspace defaults and alert channels</p></div></div>
          <div className="monitor-settings-grid">
            {!infrastructure && <>
              <LimitInput label="Default CPU" unit="%" value={settings.defaults.cpuPercent} onChange={(value) => setSettings({ ...settings, defaults: { ...settings.defaults, cpuPercent: value } })} />
              <LimitInput label="Default memory" unit="MB" value={settings.defaults.memoryMb} onChange={(value) => setSettings({ ...settings, defaults: { ...settings.defaults, memoryMb: value } })} />
              <LimitInput label="Default storage" unit="GB" value={settings.defaults.storageGb} onChange={(value) => setSettings({ ...settings, defaults: { ...settings.defaults, storageGb: value } })} />
              <LimitInput label="Default monthly traffic" unit="GB" value={settings.defaults.monthlyTrafficGb} onChange={(value) => setSettings({ ...settings, defaults: { ...settings.defaults, monthlyTrafficGb: value } })} />
            </>}
            <label className="monitor-field"><span>Retention</span><div className="unit-input"><input type="number" min="1" max="365" value={settings.retentionDays} onChange={(event) => setSettings({ ...settings, retentionDays: Number(event.target.value) })} /><small>days</small></div></label>
            {infrastructure
              ? <label className="monitor-field"><span>Node offline after</span><div className="unit-input"><input type="number" min="30" max="3600" value={settings.nodeOfflineSeconds} onChange={(event) => setSettings({ ...settings, nodeOfflineSeconds: Number(event.target.value) })} /><small>sec</small></div></label>
              : <label className="monitor-field"><span>Failed checks before alert</span><input type="number" min="1" max="20" value={settings.healthFailureThreshold} onChange={(event) => setSettings({ ...settings, healthFailureThreshold: Number(event.target.value) })} /></label>}
            <label className="monitor-field"><span>Reminder cooldown</span><div className="unit-input"><input type="number" min="1" max="1440" value={settings.cooldownMinutes} onChange={(event) => setSettings({ ...settings, cooldownMinutes: Number(event.target.value) })} /><small>min</small></div></label>
          </div>
          <div className="rule-checks">
            {(infrastructure
              ? [["notifyNodeOffline", "Node offline"], ["notifyRecovery", "Recovery"]]
              : [["notifyApplicationDown", "Application down"], ["notifyResourceLimit", "Resource limit"], ["notifyRecovery", "Recovery"]]
            ).map(([key, label]) => <label key={key}><input type="checkbox" checked={settings[key]} onChange={(event) => setSettings({ ...settings, [key]: event.target.checked })} /> {label}</label>)}
          </div>
          <div className="channel-block">
            <label><input type="checkbox" checked={settings.panelEnabled} onChange={(event) => setSettings({ ...settings, panelEnabled: event.target.checked })} /> Panel notifications</label>
            <label><input type="checkbox" checked={settings.emailEnabled} onChange={(event) => setSettings({ ...settings, emailEnabled: event.target.checked })} /> Email</label>
            <input type="text" placeholder="ops@example.com, owner@example.com" value={recipientText} onChange={(event) => setRecipientText(event.target.value)} />
            {infrastructure && <>
              <label><input type="checkbox" checked={settings.webhookEnabled} onChange={(event) => setSettings({ ...settings, webhookEnabled: event.target.checked })} /> Infrastructure webhook</label>
              <input type="url" placeholder={settings.webhookConfigured ? "Webhook configured — leave blank to keep" : "https://hooks.example.com/infrastructure"} value={settings.webhookUrl ?? ""} onChange={(event) => setSettings({ ...settings, webhookUrl: event.target.value || undefined })} />
              <input type="password" minLength="16" placeholder={settings.webhookSecretConfigured ? "Signing secret configured — leave blank to keep" : "Webhook signing secret (minimum 16 characters)"} value={settings.webhookSecret ?? ""} onChange={(event) => setSettings({ ...settings, webhookSecret: event.target.value || undefined })} />
            </>}
          </div>
          {canManage ? <button className="primary monitor-save" disabled={busy === "settings"}>{busy === "settings" ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} Save monitoring settings</button> : <p className="settings-empty">Only owners and administrators can change workspace rules.</p>}
        </form>}
      </div>
    </div>
  );
}
