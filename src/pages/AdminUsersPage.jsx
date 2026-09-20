import { useEffect, useMemo, useState } from "react";
import { Eye, LoaderCircle, Search, ShieldCheck, UserRound } from "lucide-react";
import { panelApi } from "../api/client.js";

export function AdminUsersPage({ onSupport }) {
  const [users, setUsers] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    panelApi
      .adminUsers()
      .then((response) => {
        if (!active) return;
        setUsers(response.data);
        setSelectedTeams(
          Object.fromEntries(
            response.data.map((user) => [user.id, user.teams[0]?.id || ""]),
          ),
        );
      })
      .catch((caught) => {
        if (active) setError(caught.message || "Could not load users");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        user.displayName.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        user.teams.some((team) => team.name.toLowerCase().includes(needle)),
    );
  }, [query, users]);

  return (
    <div className="settings-page admin-users-page">
      {error && <div className="data-error">{error}</div>}
      <div className="settings-heading admin-users-heading">
        <div>
          <h2>Users</h2>
          <p>Open a customer support view without leaving your admin session.</p>
        </div>
        <label className="search admin-user-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users or workspaces"
            aria-label="Search users"
          />
        </label>
      </div>

      <section className="settings-card admin-users-card">
        {loading ? (
          <div className="admin-users-loading">
            <LoaderCircle className="spin" size={18} /> Loading users…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-row">No users match this search.</div>
        ) : (
          <div className="admin-user-list">
            {filteredUsers.map((user) => {
              const selectedTeam =
                user.teams.find(
                  (team) => team.id === selectedTeams[user.id],
                ) || user.teams[0];
              return (
                <div className="admin-user-row" key={user.id}>
                  <span className="admin-user-avatar">
                    {user.isPlatformAdmin ? (
                      <ShieldCheck size={17} />
                    ) : (
                      <UserRound size={17} />
                    )}
                  </span>
                  <span className="admin-user-identity">
                    <b>{user.displayName}</b>
                    <small>{user.email}</small>
                  </span>
                  <span className={`user-state ${user.status}`}>
                    {user.isPlatformAdmin ? "Platform admin" : user.status}
                  </span>
                  <label className="admin-user-team">
                    <span>Workspace</span>
                    <select
                      value={selectedTeam?.id || ""}
                      onChange={(event) =>
                        setSelectedTeams((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                      disabled={user.teams.length === 0}
                      aria-label={`Workspace for ${user.displayName}`}
                    >
                      {user.teams.length === 0 && (
                        <option value="">No workspace</option>
                      )}
                      {user.teams.map((team) => (
                        <option value={team.id} key={team.id}>
                          {team.name} · {team.role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="secondary support-view-button"
                    onClick={() => onSupport(user, selectedTeam)}
                    disabled={
                      !selectedTeam ||
                      user.isPlatformAdmin ||
                      user.status !== "active"
                    }
                    title={
                      user.isPlatformAdmin
                        ? "Support view is intended for customer accounts"
                        : user.status !== "active"
                          ? "Only active customer accounts can be opened"
                        : `View the panel as ${user.displayName}`
                    }
                  >
                    <Eye size={15} /> View customer panel
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
