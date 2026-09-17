import { useEffect, useState } from "react";
import {
  Copy,
  LoaderCircle,
  Mail,
  Plus,
  Save,
  UserRound,
  Users,
} from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "../components/FeedbackProvider.jsx";

export function TeamPage({ team, onTeamUpdated }) {
  const feedback = useFeedback();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [form, setForm] = useState({
    email: "",
    role: "developer",
    expiresInDays: 7,
  });
  const [invitationUrl, setInvitationUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [teamName, setTeamName] = useState(team?.name || "");
  const [error, setError] = useState("");
  const canManage = team?.role === "owner" || team?.role === "administrator";
  const canInvite = canManage;

  async function load() {
    if (!team) return;
    try {
      const tasks = [panelApi.teamMembers(team.id)];
      if (canInvite) tasks.push(panelApi.teamInvitations(team.id));
      const [memberResponse, invitationResponse] = await Promise.all(tasks);
      setMembers(memberResponse.data);
      setInvitations(invitationResponse?.data || []);
    } catch (caught) {
      setError(caught.message || "Could not load team");
    }
  }

  useEffect(() => {
    load();
  }, [team?.id]);

  useEffect(() => {
    setTeamName(team?.name || "");
  }, [team?.id, team?.name]);

  async function renameTeam(event) {
    event.preventDefault();
    const name = teamName.trim();
    if (name.length < 2) {
      feedback.warning("The team name must contain at least two characters.");
      return;
    }
    setRenameBusy(true);
    try {
      await panelApi.updateTeam(team.id, { name });
      await onTeamUpdated?.();
      feedback.success(`Team renamed to ${name}.`);
    } catch (caught) {
      feedback.error(caught.message || "Could not update the team name");
    } finally {
      setRenameBusy(false);
    }
  }

  async function invite(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInvitationUrl("");
    try {
      const response = await panelApi.createInvitation(team.id, form);
      setInvitationUrl(response.data.invitationUrl);
      setForm({ ...form, email: "" });
      await load();
      feedback.success(`Invitation created for ${form.email}.`);
    } catch (caught) {
      feedback.error(caught.message || "Could not create invitation");
    } finally {
      setBusy(false);
    }
  }

  if (!team) return <div className="empty-row">No workspace selected.</div>;

  return (
    <div className="resource-page">
      <div className="resource-heading">
        <div>
          <h2>{team.name}</h2>
          <p>Members and invitations for this workspace.</p>
        </div>
        <span className="role-badge">Your role: {team.role}</span>
      </div>
      {error && <div className="data-error">{error}</div>}
      {canManage && (
        <form className="settings-card team-name-card" onSubmit={renameTeam}>
          <div className="settings-card-head">
            <div className="integration-icon access-icon">
              <Users size={20} />
            </div>
            <div>
              <h3>Workspace name</h3>
              <p>Change the team name shown throughout the control panel.</p>
            </div>
          </div>
          <div className="team-name-form">
            <div className="auth-input">
              <Users size={16} />
              <input
                required
                minLength="2"
                maxLength="120"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                aria-label="Team name"
              />
            </div>
            <button
              className="primary"
              disabled={renameBusy || teamName.trim() === team.name}
            >
              {renameBusy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Save size={16} />
              )}{" "}
              Save name
            </button>
          </div>
        </form>
      )}
      {invitationUrl && (
        <section className="one-time-secret">
          <div className="secret-head">
            <div>
              <h3>Invitation created</h3>
              <p>Send this one-time URL to the invited person.</p>
            </div>
          </div>
          <pre>{invitationUrl}</pre>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invitationUrl);
                feedback.success("Invitation link copied.");
              } catch {
                feedback.error("Could not copy the invitation link.");
              }
            }}
          >
            <Copy size={15} /> Copy invitation
          </button>
        </section>
      )}
      {canInvite && (
        <form className="settings-card invite-form" onSubmit={invite}>
          <div className="settings-card-head">
            <div className="integration-icon access-icon">
              <Users size={20} />
            </div>
            <div>
              <h3>Invite member</h3>
              <p>
                The email address must match the account accepting the
                invitation.
              </p>
            </div>
          </div>
          <div className="invite-fields">
            <label>
              <span>Email</span>
              <div className="auth-input">
                <Mail size={16} />
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  placeholder="person@example.com"
                />
              </div>
            </label>
            <label>
              <span>Role</span>
              <div className="select-wrap">
                <UserRound size={16} />
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm({ ...form, role: event.target.value })
                  }
                >
                  <option value="administrator">Administrator</option>
                  <option value="developer">Developer</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </label>
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Plus size={16} />
              )}{" "}
              Create invitation
            </button>
          </div>
        </form>
      )}
      <div className="team-grid">
        <section className="settings-card">
          <div className="settings-card-head">
            <div className="integration-icon access-icon">
              <Users size={20} />
            </div>
            <div>
              <h3>Members</h3>
              <p>{members.length} people in this workspace</p>
            </div>
          </div>
          <div className="member-list">
            {members.map((member) => (
              <div className="member-row" key={member.id}>
                <div className="avatar">
                  {member.displayName
                    .split(/\s+/)
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <b>{member.displayName}</b>
                  <span>{member.email}</span>
                </div>
                <span className="role-badge">{member.role}</span>
              </div>
            ))}
          </div>
        </section>
        {canInvite && (
          <section className="settings-card">
            <div className="settings-card-head">
              <div className="integration-icon github-icon">
                <Mail size={20} />
              </div>
              <div>
                <h3>Pending invitations</h3>
                <p>Unexpired invitation links</p>
              </div>
            </div>
            <div className="member-list">
              {invitations.length === 0 && (
                <p className="settings-empty">No pending invitations.</p>
              )}
              {invitations.map((invitation) => (
                <div className="member-row" key={invitation.id}>
                  <div>
                    <b>{invitation.email}</b>
                    <span>
                      Expires{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="role-badge">{invitation.role}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
