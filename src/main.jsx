import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Box,
  ChevronDown,
  CircleHelp,
  Code2,
  GitBranch,
  Globe2,
  LayoutDashboard,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Terminal,
  Trash2,
  Users,
} from "lucide-react";
import "./main.css";
import { panelApi } from "./api/client.js";
import { AuthGate, useAuth } from "./auth/AuthGate.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { CreateApplicationModal } from "./components/CreateApplicationModal.jsx";
import { NodesPage } from "./pages/NodesPage.jsx";
import { TeamPage } from "./pages/TeamPage.jsx";
import { DomainsPage } from "./pages/DomainsPage.jsx";
import { ApplicationsPage } from "./pages/ApplicationsPage.jsx";
import { DeploymentsPage } from "./pages/DeploymentsPage.jsx";
import { NotificationMenu } from "./components/NotificationMenu.jsx";
import { MonitoringPage } from "./pages/MonitoringPage.jsx";
import { PANEL_VERSION } from "./version.js";

const nav = [
  { label: "Overview", icon: LayoutDashboard, path: "/" },
  { label: "Applications", icon: Box, path: "/applications" },
  { label: "Nodes", icon: Server, path: "/nodes" },
  { label: "Domains", icon: Globe2, path: "/domains" },
  { label: "Deployments", icon: GitBranch, path: "/deployments" },
  { label: "Monitoring", icon: Activity, path: "/monitoring" },
  { label: "Team", icon: Users, path: "/team" },
];
const secondaryRoutes = [
  { label: "Settings", path: "/settings" },
  { label: "Documentation", path: "/documentation" },
];
const emptyStats = {
  applications: 0,
  runningApplications: 0,
  nodes: 0,
  onlineNodes: 0,
  domains: 0,
  proxiedDomains: 0,
  deploymentsThisMonth: 0,
};

function relativeTime(value) {
  if (!value || value === "Not deployed") return "Not deployed";
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function routeFromPathname(pathname = window.location.pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const applicationMatch = normalized.match(/^\/applications\/([^/]+)$/);
  if (applicationMatch) {
    return {
      page: "Applications",
      applicationId: decodeURIComponent(applicationMatch[1]),
    };
  }

  if (normalized.startsWith("/settings")) return { page: "Settings" };
  const route = [...nav, ...secondaryRoutes].find(
    (candidate) => candidate.path === normalized,
  );
  return { page: route?.label || "Overview" };
}

function isPlainNavigation(event) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function App() {
  const { user, logout } = useAuth();
  const selectedTeam =
    user.teams?.find(
      (team) => team.id === window.localStorage.getItem("lh_active_team"),
    ) || user.teams?.[0];
  const [route, setRoute] = useState(routeFromPathname);
  const page = route.page;
  const [query, setQuery] = useState("");
  const [apps, setApps] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [systemStatus, setSystemStatus] = useState("operational");
  const [dataError, setDataError] = useState("");
  const [showCreateApplication, setShowCreateApplication] = useState(false);
  const navigate = useCallback((path, options = {}) => {
    const method = options.replace ? "replaceState" : "pushState";
    window.history[method]({}, "", path);
    setRoute(routeFromPathname(path));
  }, []);
  const followLink = useCallback(
    (event, path) => {
      if (!isPlainNavigation(event)) return;
      event.preventDefault();
      navigate(path);
    },
    [navigate],
  );
  useEffect(() => {
    const handlePopState = () => setRoute(routeFromPathname());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const loadDashboard = useCallback(async () => {
    setDataError("");
    try {
      const [
        applicationResponse,
        overviewResponse,
        nodeResponse,
        deploymentResponse,
      ] = await Promise.all([
        panelApi.applications(),
        panelApi.overview(),
        panelApi.nodes(),
        panelApi.deployments(),
      ]);
      setApps(applicationResponse.data);
      setStats(overviewResponse.data.stats);
      setSystemStatus(overviewResponse.data.systemStatus);
      setNodes(nodeResponse.data);
      setDeployments(deploymentResponse.data);
    } catch (error) {
      setDataError(error.message || "Could not load workspace data");
    }
  }, []);
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);
  async function applicationAction(applicationId, action) {
    setDataError("");
    try {
      await panelApi.applicationAction(applicationId, action);
      await loadDashboard();
    } catch (error) {
      setDataError(error.message || "Could not queue application action");
    }
  }
  async function deleteApplication(application) {
    if (
      !window.confirm(
        `Delete ${application.name}? Its files will be moved to recoverable node trash.`,
      )
    )
      return;
    setDataError("");
    try {
      await panelApi.deleteApplication(application.id);
      await loadDashboard();
    } catch (error) {
      setDataError(error.message || "Could not queue application deletion");
    }
  }
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="mark">L</div>
          <div>
            <strong>Legacy Hosting</strong>
            <span>Control panel</span>
          </div>
        </div>
        <div className="workspace">
          <div className="workspace-icon">N</div>
          <div>
            <b>{selectedTeam?.name || "Workspace"}</b>
            <small>{selectedTeam?.role || "No team selected"}</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav>
          {nav.map(({ label, icon: Icon, path }) => (
            <a
              className={page === label ? "active" : ""}
              href={path}
              onClick={(event) => followLink(event, path)}
              key={path}
            >
              <Icon size={17} />
              {label}
            </a>
          ))}
        </nav>
        <div className="aside-bottom">
          <a
            className={page === "Settings" ? "active" : ""}
            href="/settings"
            onClick={(event) => followLink(event, "/settings")}
          >
            <Settings size={17} />
            Settings
          </a>
          <a
            className={page === "Documentation" ? "active" : ""}
            href="/documentation"
            onClick={(event) => followLink(event, "/documentation")}
          >
            <CircleHelp size={17} />
            Documentation
          </a>
          <div className="profile">
            <div className="avatar">
              {user.displayName
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <b>{user.displayName}</b>
              <small>{user.isPlatformAdmin ? "Administrator" : "Member"}</small>
            </div>
            <button
              className="profile-action"
              onClick={logout}
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">
              {page === "Overview" ? "Workspace overview" : page}
            </div>
            <h1>
              {page === "Overview"
                ? `Good afternoon, ${user.displayName.split(/\s+/)[0]}`
                : page}
            </h1>
          </div>
          <div className="header-actions">
            <button className="icon-btn">
              <Search size={18} />
            </button>
            <NotificationMenu />
            <button
              className="icon-btn mobile-logout"
              onClick={logout}
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
            <button className={`status ${systemStatus}`}>
              <span></span>{" "}
              {systemStatus === "operational"
                ? "All systems operational"
                : "Some systems need attention"}
            </button>
            <button
              className="primary"
              onClick={() => setShowCreateApplication(true)}
            >
              <Plus size={17} /> New application
            </button>
          </div>
        </header>
        <div className="scroll-content">
          {page === "Overview" ? (
            <Overview
              query={query}
              setQuery={setQuery}
              apps={apps}
              nodes={nodes}
              deployments={deployments}
              stats={stats}
              systemStatus={systemStatus}
              dataError={dataError}
              onRefresh={loadDashboard}
              onAction={applicationAction}
              onDelete={deleteApplication}
              onNavigate={navigate}
            />
          ) : page === "Settings" ? (
            <SettingsPage user={user} />
          ) : page === "Applications" ? (
            <ApplicationsPage
              team={selectedTeam}
              initialApplicationId={route.applicationId}
              onApplicationSelect={(applicationId, options) =>
                navigate(`/applications/${encodeURIComponent(applicationId)}`, options)
              }
            />
          ) : page === "Nodes" ? (
            <NodesPage />
          ) : page === "Domains" ? (
            <DomainsPage />
          ) : page === "Team" ? (
            <TeamPage team={selectedTeam} />
          ) : page === "Deployments" ? (
            <DeploymentsPage />
          ) : page === "Monitoring" ? (
            <MonitoringPage team={selectedTeam} />
          ) : (
            <Placeholder page={page} />
          )}
        </div>
        <Footer />
      </main>
      <CreateApplicationModal
        open={showCreateApplication}
        onClose={() => setShowCreateApplication(false)}
        onCreated={loadDashboard}
      />
    </div>
  );
}
function Overview({
  query,
  setQuery,
  apps,
  nodes,
  deployments,
  stats,
  systemStatus,
  dataError,
  onRefresh,
  onAction,
  onDelete,
  onNavigate,
}) {
  return (
    <>
      <section className="hero">
        <div>
          <div className="hero-icon">
            <Activity size={22} />
          </div>
          <h2>
            {systemStatus === "operational"
              ? "Your applications are healthy"
              : "Your infrastructure needs attention"}
          </h2>
          <p>Monitor deployments, nodes, and domains from one place.</p>
        </div>
        <button className="secondary" onClick={onRefresh}>
          <RefreshCw size={16} /> Refresh data
        </button>
      </section>
      {dataError && <div className="data-error">{dataError}</div>}
      <div className="stats">
        <Stat
          label="Applications"
          value={stats.applications}
          note={`${stats.runningApplications} running`}
          icon={Box}
        />
        <Stat
          label="Nodes"
          value={stats.nodes}
          note={`${stats.onlineNodes} online`}
          icon={Server}
        />
        <Stat
          label="Domains"
          value={stats.domains}
          note={`${stats.proxiedDomains} proxied`}
          icon={Globe2}
        />
        <Stat
          label="Deployments"
          value={stats.deploymentsThisMonth}
          note="This month"
          icon={GitBranch}
        />
      </div>
      <section className="section-head">
        <div>
          <h3>Applications</h3>
          <p>Live status across your workspace</p>
        </div>
        <div className="filters">
          <div className="search">
            <Search size={16} />
            <input
              placeholder="Search applications"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="secondary">
            All statuses <ChevronDown size={15} />
          </button>
        </div>
      </section>
      <div className="app-list">
        {apps.length === 0 && (
          <div className="empty-row">
            No applications have been created yet.
          </div>
        )}
        {apps
          .filter((a) => a.name.includes(query.toLowerCase()))
          .map((a) => (
            <div className="app-row" key={a.name}>
              <div className={"app-logo " + a.color}>
                <Code2 size={19} />
              </div>
              <a
                className="app-name app-name-link"
                href={`/applications/${encodeURIComponent(a.id)}`}
                onClick={(event) => {
                  if (!isPlainNavigation(event)) return;
                  event.preventDefault();
                  onNavigate(`/applications/${encodeURIComponent(a.id)}`);
                }}
              >
                <b>{a.name}</b>
                <span>
                  <Globe2 size={13} />
                  {a.domain}
                </span>
              </a>
              <div className="pill">
                <i className={a.status === "Running" ? "green" : "gray"}></i>
                {a.status}
              </div>
              <div className="metric">
                <small>CPU</small>
                <b>{a.cpu}</b>
              </div>
              <div className="metric">
                <small>Memory</small>
                <b>{a.mem}</b>
              </div>
              <div className="deploy">
                <small>Last deployment</small>
                <b>{relativeTime(a.deploy)}</b>
              </div>
              <button
                className="row-action"
                onClick={() =>
                  onAction(a.id, a.status === "Stopped" ? "start" : "restart")
                }
                title={a.status === "Stopped" ? "Start" : "Restart"}
              >
                <Play size={15} />
              </button>
              <button
                className="row-action danger-action"
                onClick={() => onDelete(a)}
                title="Delete application"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
      </div>
      <div className="lower">
        <section className="card">
          <div className="card-title">
            <div>
              <h3>Node health</h3>
              <p>Resource usage across your infrastructure</p>
            </div>
            <a
              className="link"
              href="/nodes"
              onClick={(event) => {
                if (!isPlainNavigation(event)) return;
                event.preventDefault();
                onNavigate("/nodes");
              }}
            >
              View nodes
            </a>
          </div>
          {nodes.length === 0 && (
            <div className="empty-card">No nodes yet.</div>
          )}
          {nodes.slice(0, 3).map((node) => (
            <Node key={node.id} {...node} />
          ))}
        </section>
        <section className="card">
          <div className="card-title">
            <div>
              <h3>Recent activity</h3>
              <p>Latest changes in your workspace</p>
            </div>
            <a
              className="link"
              href="/deployments"
              onClick={(event) => {
                if (!isPlainNavigation(event)) return;
                event.preventDefault();
                onNavigate("/deployments");
              }}
            >
              View all
            </a>
          </div>
          {deployments.length === 0 && (
            <div className="empty-card">No deployment activity yet.</div>
          )}
          {deployments.slice(0, 3).map((deployment) => (
            <ActivityItem
              key={deployment.id}
              icon={GitBranch}
              text={`${deployment.applicationName} ${deployment.status}`}
              time={relativeTime(deployment.createdAt)}
            />
          ))}
        </section>
      </div>
    </>
  );
}
function Stat({ label, value, note, icon: Icon }) {
  return (
    <div className="stat">
      <div className="stat-icon">
        <Icon size={18} />
      </div>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </div>
  );
}
function Node({ name, region, status, memory, disk }) {
  return (
    <div className="node">
      <div className="node-symbol">
        <Server size={17} />
      </div>
      <div className="node-info">
        <b>{name}</b>
        <span>
          {region || "Unknown region"} · {status}
        </span>
      </div>
      <div className="bar">
        <small>
          Memory <b>{Number(memory || 0).toFixed(0)}%</b>
        </small>
        <div>
          <i style={{ width: Math.min(Number(memory || 0), 100) + "%" }}></i>
        </div>
      </div>
      <div className="bar">
        <small>
          Disk <b>{disk === null ? "—" : `${Number(disk).toFixed(0)}%`}</b>
        </small>
        <div>
          <i style={{ width: Math.min(Number(disk || 0), 100) + "%" }}></i>
        </div>
      </div>
    </div>
  );
}
function ActivityItem({ icon: Icon, text, time }) {
  return (
    <div className="activity">
      <div>
        <Icon size={16} />
      </div>
      <span>
        <b>{text}</b>
        <small>{time}</small>
      </span>
    </div>
  );
}
function Placeholder({ page }) {
  return (
    <div className="placeholder">
      <div className="hero-icon">
        <Terminal size={23} />
      </div>
      <h2>{page} is ready for configuration</h2>
      <p>
        This area will connect to the Legacy Hosting API and MySQL 8 data layer.
      </p>
      <button className="primary">
        <Plus size={17} /> Add {page.toLowerCase().replace("s", "")}
      </button>
    </div>
  );
}
function Footer() {
  const [now, setNow] = useState(new Date());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const osloFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const osloParts = Object.fromEntries(
    osloFormatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const time = `${osloParts.day}.${osloParts.month}.${osloParts.year} ${osloParts.hour}:${osloParts.minute}:${osloParts.second}`;
  return (
    <footer>
      <span>LH-Panel v{PANEL_VERSION}</span>
      <span>
        Copyright 2009 © {osloParts.year}{" "}
        <a href="https://legacyhosting.xyz" target="_blank" rel="noreferrer">
          Legacy Hosting
        </a>
      </span>
      <span>{time}</span>
    </footer>
  );
}
createRoot(document.getElementById("root")).render(
  <AuthGate>
    <App />
  </AuthGate>,
);
