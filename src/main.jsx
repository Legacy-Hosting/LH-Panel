import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowLeft,
  Box,
  ChevronDown,
  CircleHelp,
  Code2,
  GitBranch,
  Globe2,
  LayoutDashboard,
  LogOut,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Terminal,
  Trash2,
  Users,
} from "lucide-react";
import "./main.css";
import { panelApi } from "./api/client.js";
import { AuthGate, useAuth } from "./auth/AuthGate.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { CreateApplicationModal } from "./components/CreateApplicationModal.jsx";
import { EditApplicationModal } from "./components/EditApplicationModal.jsx";
import { NodesPage } from "./pages/NodesPage.jsx";
import { TeamPage } from "./pages/TeamPage.jsx";
import { DomainsPage } from "./pages/DomainsPage.jsx";
import { ApplicationsPage } from "./pages/ApplicationsPage.jsx";
import { DeploymentsPage } from "./pages/DeploymentsPage.jsx";
import { NotificationMenu } from "./components/NotificationMenu.jsx";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher.jsx";
import { MonitoringPage } from "./pages/MonitoringPage.jsx";
import { AdminSettingsPage } from "./pages/AdminSettingsPage.jsx";
import { AdminUsersPage } from "./pages/AdminUsersPage.jsx";
import { PANEL_VERSION } from "./version.js";
import { greetingForHour } from "./greeting.js";
import {
  FeedbackProvider,
  useFeedback,
} from "./components/FeedbackProvider.jsx";

const nav = [
  { label: "Overview", icon: LayoutDashboard, path: "/" },
  { label: "Applications", icon: Box, path: "/applications" },
  { label: "Domains", icon: Globe2, path: "/domains" },
  { label: "Deployments", icon: GitBranch, path: "/deployments" },
  { label: "Monitoring", icon: Activity, path: "/monitoring" },
  { label: "Team", icon: Users, path: "/team" },
];
const adminNav = { label: "Admin", icon: Shield, path: "/admin/nodes" };
const secondaryRoutes = [
  { label: "Settings", path: "/settings" },
  { label: "Documentation", path: "/documentation" },
];
const emptyStats = {
  applications: 0,
  runningApplications: 0,
  domains: 0,
  proxiedDomains: 0,
  deploymentsThisMonth: 0,
};
const SUPPORT_VIEW_KEY = "lh_support_view";

function storedSupportView() {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(SUPPORT_VIEW_KEY) || "null",
    );
    return value?.id && Array.isArray(value.teams) ? value : null;
  } catch {
    return null;
  }
}

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

  const adminMatch = normalized.match(
    /^\/admin(?:\/(nodes|monitoring|users|settings))?$/,
  );
  if (adminMatch) {
    return { page: "Admin", adminSection: adminMatch[1] || "nodes" };
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
  const { user, logout, refresh } = useAuth();
  const feedback = useFeedback();
  const [supportView, setSupportView] = useState(storedSupportView);
  const [localHour, setLocalHour] = useState(() => new Date().getHours());
  const [activeTeamId, setActiveTeamId] = useState(
    () => window.localStorage.getItem("lh_active_team") || "",
  );
  const effectiveUser = supportView || user;
  const effectiveTeams = effectiveUser.teams || [];
  const selectedTeam =
    effectiveTeams.find((team) => team.id === activeTeamId) || effectiveTeams[0];
  const [route, setRoute] = useState(routeFromPathname);
  const page = route.page;
  const effectiveIsPlatformAdmin = user.isPlatformAdmin && !supportView;
  const visibleNav = effectiveIsPlatformAdmin ? [...nav, adminNav] : nav;
  const [query, setQuery] = useState("");
  const [apps, setApps] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [stats, setStats] = useState(emptyStats);
  const [systemStatus, setSystemStatus] = useState("operational");
  const [applicationTransitions, setApplicationTransitions] = useState({});
  const [dataError, setDataError] = useState("");
  const [showCreateApplication, setShowCreateApplication] = useState(false);
  const [editingApplicationId, setEditingApplicationId] = useState("");
  const [applicationRevision, setApplicationRevision] = useState(0);
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
  useEffect(() => {
    const updateLocalHour = () => setLocalHour(new Date().getHours());
    const timer = window.setInterval(updateLocalHour, 60_000);
    window.addEventListener("focus", updateLocalHour);
    document.addEventListener("visibilitychange", updateLocalHour);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateLocalHour);
      document.removeEventListener("visibilitychange", updateLocalHour);
    };
  }, []);
  useEffect(() => {
    if (page === "Admin" && !effectiveIsPlatformAdmin) {
      navigate("/", { replace: true });
    }
  }, [effectiveIsPlatformAdmin, navigate, page]);
  useEffect(() => {
    if (user.isPlatformAdmin) return;
    panelApi.clearSupportUser();
    window.sessionStorage.removeItem(SUPPORT_VIEW_KEY);
    setSupportView(null);
  }, [user.isPlatformAdmin]);
  useEffect(() => {
    if (selectedTeam?.id && activeTeamId !== selectedTeam.id) {
      panelApi.selectTeam(selectedTeam.id);
      setActiveTeamId(selectedTeam.id);
    }
  }, [activeTeamId, selectedTeam?.id]);
  const loadDashboard = useCallback(async () => {
    const teamId = selectedTeam?.id;
    if (!teamId) return;
    setDataError("");
    try {
      const [applicationResponse, overviewResponse, deploymentResponse] = await Promise.all([
        panelApi.applications(),
        panelApi.overview(),
        panelApi.deployments(),
      ]);
      if (window.localStorage.getItem("lh_active_team") !== teamId) return;
      setApps(applicationResponse.data);
      setStats(overviewResponse.data.stats);
      setSystemStatus(overviewResponse.data.systemStatus);
      setDataError("");
      setDeployments(deploymentResponse.data);
    } catch (error) {
      if (window.localStorage.getItem("lh_active_team") !== teamId) return;
      setDataError(error.message || "Could not load workspace data");
    }
  }, [selectedTeam?.id]);
  const loadSystemSummary = useCallback(async ({ includeApplications = false } = {}) => {
    const teamId = selectedTeam?.id;
    if (!teamId) return;
    try {
      const [applicationResponse, overviewResponse] = await Promise.all([
        includeApplications ? panelApi.applications() : Promise.resolve(null),
        panelApi.overview(),
      ]);
      if (window.localStorage.getItem("lh_active_team") !== teamId) return;
      if (applicationResponse) setApps(applicationResponse.data);
      setStats(overviewResponse.data.stats);
      setSystemStatus(overviewResponse.data.systemStatus);
      setDataError("");
    } catch (error) {
      if (window.localStorage.getItem("lh_active_team") !== teamId) return;
      setDataError(error.message || "Could not refresh system status");
    }
  }, [selectedTeam?.id]);
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);
  useEffect(() => {
    if (page !== "Overview") return undefined;
    const timer = window.setInterval(loadDashboard, 30_000);
    return () => window.clearInterval(timer);
  }, [loadDashboard, page]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") loadSystemSummary();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadSystemSummary]);
  async function applicationAction(applicationId, action) {
    setApplicationTransitions((current) => ({
      ...current,
      [applicationId]: action === "start" ? "Starting" : "Restarting",
    }));
    try {
      const queued = await panelApi.applicationAction(applicationId, action);
      feedback.success(
        `Application ${action === "start" ? "start" : "restart"} queued.`,
      );
      if (queued.data.commandId) {
        let command = null;
        for (let attempt = 0; attempt < 300; attempt += 1) {
          const response = await panelApi.applicationCommand(
            applicationId,
            queued.data.commandId,
          );
          command = response.data;
          await loadSystemSummary({ includeApplications: true });
          if (["succeeded", "failed", "cancelled"].includes(command.status)) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        }
        if (command?.status !== "succeeded") {
          throw new Error(
            command?.output ||
              (command
                ? `Application ${action} ${command.status}.`
                : `Application ${action} is still waiting for the node.`),
          );
        }
      }
      await loadDashboard();
    } catch (error) {
      feedback.error(error.message || "Could not queue application action");
      await loadSystemSummary({ includeApplications: true });
    } finally {
      setApplicationTransitions((current) => {
        const next = { ...current };
        delete next[applicationId];
        return next;
      });
    }
  }
  async function deleteApplication(application) {
    const approved = await feedback.confirm({
      title: `Delete ${application.name}?`,
      message:
        "The application will stop and its files will be moved to recoverable node trash.",
      confirmLabel: "Delete application",
    });
    if (!approved) return;
    try {
      const queued = await panelApi.deleteApplication(application.id);
      setApps((current) =>
        current.map((item) =>
          item.id === application.id ? { ...item, status: "Deleting" } : item,
        ),
      );
      feedback.warning(`${application.name} is being deleted…`);
      let command = null;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const response = await panelApi.applicationCommand(
          application.id,
          queued.data.commandId,
        );
        command = response.data;
        if (["succeeded", "failed", "cancelled"].includes(command.status))
          break;
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
      }
      if (command?.status !== "succeeded") {
        throw new Error(
          command?.output ||
            (command
              ? `Application deletion ${command.status}.`
              : "Application deletion is still waiting for the node."),
        );
      }
      setApps((current) =>
        current.filter((item) => item.id !== application.id),
      );
      if (route.applicationId === application.id)
        navigate("/applications", { replace: true });
      if (editingApplicationId === application.id)
        setEditingApplicationId("");
      setApplicationRevision((current) => current + 1);
      feedback.success(`${application.name} was deleted.`);
      await loadDashboard();
      return true;
    } catch (error) {
      feedback.error(error.message || "Could not delete application");
      await loadDashboard();
      return false;
    }
  }
  async function handleLogout() {
    try {
      await logout();
      panelApi.clearSupportUser();
      window.sessionStorage.removeItem(SUPPORT_VIEW_KEY);
      feedback.success("You have been signed out.");
    } catch (error) {
      feedback.error(error.message || "Could not sign out");
    }
  }
  function handleTeamSelect(team) {
    if (!team || team.id === selectedTeam?.id) return;
    panelApi.selectTeam(team.id);
    setActiveTeamId(team.id);
    setApps([]);
    setDeployments([]);
    setStats(emptyStats);
    setApplicationTransitions({});
    setDataError("");
    setShowCreateApplication(false);
    setEditingApplicationId("");
    if (route.applicationId) navigate("/applications", { replace: true });
  }
  async function handleTeamCreated(team) {
    panelApi.selectTeam(team.id);
    await refresh();
    handleTeamSelect(team);
  }
  function enterSupportView(customer, team) {
    if (!team) return;
    const nextSupportView = {
      ...customer,
      returnTeamId: selectedTeam?.id || user.teams?.[0]?.id || "",
    };
    panelApi.selectSupportUser(customer.id);
    panelApi.selectTeam(team.id);
    window.sessionStorage.setItem(
      SUPPORT_VIEW_KEY,
      JSON.stringify(nextSupportView),
    );
    setSupportView(nextSupportView);
    setActiveTeamId(team.id);
    setApps([]);
    setDeployments([]);
    setStats(emptyStats);
    setDataError("");
    setShowCreateApplication(false);
    setEditingApplicationId("");
    navigate("/", { replace: true });
    feedback.warning(`Support view opened for ${customer.displayName}.`);
  }
  function exitSupportView() {
    const returnTeam =
      user.teams?.find((team) => team.id === supportView?.returnTeamId) ||
      user.teams?.[0];
    panelApi.clearSupportUser();
    window.sessionStorage.removeItem(SUPPORT_VIEW_KEY);
    if (returnTeam) panelApi.selectTeam(returnTeam.id);
    setSupportView(null);
    setActiveTeamId(returnTeam?.id || "");
    setApps([]);
    setDeployments([]);
    setStats(emptyStats);
    setDataError("");
    setShowCreateApplication(false);
    setEditingApplicationId("");
    navigate("/admin/users", { replace: true });
    feedback.success("Returned to your administrator account.");
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
        <div className="desktop-workspace-switcher">
          <WorkspaceSwitcher
            teams={effectiveTeams}
            selectedTeam={selectedTeam}
            onSelect={handleTeamSelect}
            onCreated={handleTeamCreated}
            canCreate={!supportView}
          />
        </div>
        <nav>
          {visibleNav.map(({ label, icon: Icon, path }) => (
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
          <a
            className={`mobile-nav-secondary ${page === "Settings" ? "active" : ""}`}
            href="/settings"
            onClick={(event) => followLink(event, "/settings")}
          >
            <Settings size={17} />
            Settings
          </a>
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
              {effectiveUser.displayName
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <b>{effectiveUser.displayName}</b>
              <small>
                {supportView
                  ? "Customer support view"
                  : user.isPlatformAdmin
                    ? "Administrator"
                    : "Member"}
              </small>
            </div>
            <button
              className="profile-action"
              onClick={handleLogout}
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
                ? `${greetingForHour(localHour)}, ${effectiveUser.displayName.split(/\s+/)[0]}`
                : page}
            </h1>
          </div>
          <div className="mobile-workspace-switcher">
            <WorkspaceSwitcher
              compact
              teams={effectiveTeams}
              selectedTeam={selectedTeam}
              onSelect={handleTeamSelect}
              onCreated={handleTeamCreated}
              canCreate={!supportView}
            />
          </div>
          <div className="header-actions">
            {supportView && (
              <button
                className="support-exit"
                onClick={exitSupportView}
                title="Return to administrator account"
              >
                <ArrowLeft size={15} />
                <span>Exit {supportView.displayName}</span>
              </button>
            )}
            <button className="icon-btn">
              <Search size={18} />
            </button>
            <NotificationMenu key={selectedTeam?.id} />
            <button
              className="icon-btn mobile-logout"
              onClick={handleLogout}
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
        <div className="scroll-content" key={selectedTeam?.id}>
          {page === "Overview" ? (
            <Overview
              query={query}
              setQuery={setQuery}
              apps={apps.map((application) => ({
                ...application,
                status:
                  applicationTransitions[application.id] || application.status,
              }))}
              deployments={deployments}
              stats={stats}
              systemStatus={systemStatus}
              dataError={dataError}
              onRefresh={loadDashboard}
              onAction={applicationAction}
              onDelete={deleteApplication}
              onEdit={setEditingApplicationId}
              onNavigate={navigate}
              canMutate={["owner", "administrator", "developer"].includes(
                selectedTeam?.role,
              )}
            />
          ) : page === "Settings" ? (
            <SettingsPage />
          ) : page === "Applications" ? (
            <ApplicationsPage
              team={selectedTeam}
              isPlatformAdmin={effectiveIsPlatformAdmin}
              initialApplications={apps}
              initialApplicationId={route.applicationId}
              refreshKey={applicationRevision}
              onEdit={setEditingApplicationId}
              onDelete={deleteApplication}
              onApplicationSelect={(applicationId, options) =>
                navigate(`/applications/${encodeURIComponent(applicationId)}`, options)
              }
              onStatusRefresh={loadSystemSummary}
              onApplicationsLoaded={setApps}
            />
          ) : page === "Domains" ? (
            <DomainsPage />
          ) : page === "Team" ? (
            <TeamPage team={selectedTeam} onTeamUpdated={refresh} />
          ) : page === "Deployments" ? (
            <DeploymentsPage />
          ) : page === "Monitoring" ? (
            <MonitoringPage team={selectedTeam} />
          ) : page === "Admin" && effectiveIsPlatformAdmin ? (
            <AdminPage
              section={route.adminSection}
              team={selectedTeam}
              onNavigate={navigate}
              onSupport={enterSupportView}
            />
          ) : (
            <Placeholder page={page} />
          )}
        </div>
        <Footer />
      </main>
      <CreateApplicationModal
        key={selectedTeam?.id}
        open={showCreateApplication}
        onClose={() => setShowCreateApplication(false)}
        onCreated={loadDashboard}
      />
      <EditApplicationModal
        applicationId={editingApplicationId}
        onClose={() => setEditingApplicationId("")}
        onUpdated={async () => {
          setApplicationRevision((current) => current + 1);
          await loadDashboard();
        }}
      />
    </div>
  );
}
function Overview({
  query,
  setQuery,
  apps,
  deployments,
  stats,
  systemStatus,
  dataError,
  onRefresh,
  onAction,
  onDelete,
  onEdit,
  onNavigate,
  canMutate,
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
          <p>Monitor applications, deployments, and domains from one place.</p>
        </div>
        <button className="secondary" onClick={onRefresh}>
          <RefreshCw size={16} /> Refresh data
        </button>
      </section>
      {dataError && <div className="data-error">{dataError}</div>}
      <div className="stats customer-stats">
        <Stat
          label="Applications"
          value={stats.applications}
          note={`${stats.runningApplications} running`}
          icon={Box}
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
              <div className="app-row-actions">
                <button
                  className="row-action"
                  onClick={() =>
                    onAction(
                      a.id,
                      a.status === "Stopped" ? "start" : "restart",
                    )
                  }
                  title={a.status === "Stopped" ? "Start" : "Restart"}
                  disabled={["Starting", "Restarting"].includes(a.status)}
                >
                  <Play size={15} />
                </button>
                {canMutate && (
                  <button
                    className="row-action"
                    onClick={() => onEdit(a.id)}
                    title="Edit application"
                    aria-label={`Edit ${a.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                )}
                {canMutate && (
                  <button
                    className="row-action danger-action"
                    onClick={() => onDelete(a)}
                    title="Delete application"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
      <div className="lower customer-lower">
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

function AdminPage({ section, team, onNavigate, onSupport }) {
  const tabs = [
    { id: "nodes", label: "Nodes", path: "/admin/nodes" },
    {
      id: "monitoring",
      label: "Infrastructure monitoring",
      path: "/admin/monitoring",
    },
    { id: "users", label: "Users", path: "/admin/users" },
    { id: "settings", label: "Platform access", path: "/admin/settings" },
  ];
  return (
    <div className="admin-page">
      <div className="admin-tabs" aria-label="Administration">
        {tabs.map((tab) => (
          <a
            className={section === tab.id ? "active" : ""}
            href={tab.path}
            key={tab.id}
            onClick={(event) => {
              if (!isPlainNavigation(event)) return;
              event.preventDefault();
              onNavigate(tab.path);
            }}
          >
            {tab.label}
          </a>
        ))}
      </div>
      {section === "monitoring" ? (
        <MonitoringPage team={team} infrastructure />
      ) : section === "users" ? (
        <AdminUsersPage onSupport={onSupport} />
      ) : section === "settings" ? (
        <AdminSettingsPage />
      ) : (
        <NodesPage />
      )}
    </div>
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
  <FeedbackProvider>
    <AuthGate>
      <App />
    </AuthGate>
  </FeedbackProvider>,
);
