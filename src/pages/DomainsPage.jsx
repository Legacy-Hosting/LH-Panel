import { useEffect, useState } from "react";
import { Cloud, Globe2, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { panelApi } from "../api/client.js";

function displayDate(value) {
  if (!value) return "Not issued";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Oslo",
  }).format(new Date(value));
}

export function DomainsPage() {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await panelApi.domains();
      setDomains(response.data);
    } catch (caught) {
      setError(caught.message || "Could not load domains");
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
          <h2>Domains</h2>
          <p>Cloudflare DNS, origin proxy, and certificate state.</p>
        </div>
        <button className="secondary" onClick={load} disabled={loading}>
          {loading ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <RefreshCw size={16} />
          )}
          Refresh
        </button>
      </div>
      {error && <div className="data-error">{error}</div>}
      <div className="resource-list">
        {!loading && domains.length === 0 && (
          <div className="empty-row">
            Domains are created when you add an application.
          </div>
        )}
        {domains.map((domain) => (
          <div className="resource-row domain-row" key={domain.id}>
            <div className="resource-symbol">
              <Globe2 size={18} />
            </div>
            <div className="resource-main">
              <b>{domain.hostname}</b>
              <span>
                {domain.recordType} → {domain.dnsTarget}
              </span>
            </div>
            <div className="resource-detail">
              <small>Cloudflare DNS</small>
              <b className={domain.status === "active" ? "online-text" : "muted-text"}>
                <Cloud size={12} /> {domain.status} {domain.proxied ? "· proxied" : ""}
              </b>
            </div>
            <div className="resource-detail">
              <small>Origin TLS</small>
              <b className={domain.proxyStatus === "active" ? "online-text" : "muted-text"}>
                <ShieldCheck size={12} /> {domain.proxyStatus}
              </b>
            </div>
            <div className="resource-detail">
              <small>Certificate expires</small>
              <b>{displayDate(domain.certificateExpiresAt)}</b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
