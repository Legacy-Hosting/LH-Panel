import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, ShieldOff, ShieldX } from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "../components/FeedbackProvider.jsx";

function timestamp(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminFirewallPage() {
  const feedback = useFeedback();
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyIp, setBusyIp] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await panelApi.firewallBans();
      setBans(response.data);
    } catch (caught) {
      setError(caught.message || "Could not load the global firewall denylist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function unban(ban) {
    const approved = await feedback.confirm({
      title: `Unban ${ban.ipAddress}?`,
      message:
        "This removes the centrally managed UFW rule and the local Fail2Ban ban from every online server.",
      confirmLabel: "Unban IP address",
      tone: "warning",
    });
    if (!approved) return;
    setBusyIp(ban.ipAddress);
    try {
      await panelApi.unbanFirewallAddress(ban.ipAddress, "Removed in LH-Panel");
      setBans((current) =>
        current.map((item) =>
          item.ipAddress === ban.ipAddress
            ? {
                ...item,
                active: false,
                removedAt: new Date().toISOString(),
                removalReason: "Removed in LH-Panel",
              }
            : item,
        ),
      );
      feedback.success(`${ban.ipAddress} is being removed from all servers.`);
    } catch (caught) {
      feedback.error(caught.message || "Could not remove the firewall ban");
    } finally {
      setBusyIp("");
    }
  }

  return (
    <div className="settings-page admin-firewall-page">
      <div className="settings-heading admin-firewall-heading">
        <div>
          <h2>Global firewall</h2>
          <p>
            Fail2Ban addresses shared by every Legacy Hosting server through
            LH-API.
          </p>
        </div>
        <button className="secondary" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} size={15} /> Refresh
        </button>
      </div>
      {error && <div className="data-error">{error}</div>}
      <section className="settings-card admin-firewall-card">
        {loading ? (
          <div className="admin-users-loading">
            <LoaderCircle className="spin" size={17} /> Loading firewall bans
          </div>
        ) : bans.length === 0 ? (
          <div className="empty-card">No firewall bans have been recorded.</div>
        ) : (
          <div className="firewall-ban-list">
            {bans.map((ban) => (
              <div className="firewall-ban-row" key={ban.ipAddress}>
                <div className={`firewall-ban-icon ${ban.active ? "active" : ""}`}>
                  {ban.active ? <ShieldX size={17} /> : <ShieldOff size={17} />}
                </div>
                <div className="firewall-ban-address">
                  <b>{ban.ipAddress}</b>
                  <small>
                    {ban.sourceNodeName || "Initial denylist"} · {ban.sourceJail}
                  </small>
                </div>
                <span className={`user-state ${ban.active ? "blocked" : ""}`}>
                  {ban.active ? "Blocked" : "Removed"}
                </span>
                <div className="firewall-ban-detail firewall-ban-activations">
                  <small>Last reported</small>
                  <span>{timestamp(ban.lastReportedAt)}</span>
                </div>
                <div className="firewall-ban-detail">
                  <small>Activations</small>
                  <span>{ban.activationCount}</span>
                </div>
                <button
                  className="secondary firewall-unban"
                  onClick={() => unban(ban)}
                  disabled={!ban.active || Boolean(busyIp)}
                  aria-label={`Unban ${ban.ipAddress}`}
                >
                  {busyIp === ban.ipAddress ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <ShieldOff size={15} />
                  )}
                  {ban.active ? "Unban" : "Removed"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
