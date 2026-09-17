import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Plus, X } from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "./FeedbackProvider.jsx";

function teamInitial(team) {
  return team?.name?.trim().charAt(0).toUpperCase() || "T";
}

function roleLabel(role) {
  if (!role) return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function WorkspaceSwitcher({
  teams = [],
  selectedTeam,
  onSelect,
  onCreated,
  compact = false,
}) {
  const feedback = useFeedback();
  const rootRef = useRef(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!showCreate) return undefined;
    const closeWithEscape = (event) => {
      if (event.key === "Escape" && !busy) setShowCreate(false);
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [busy, showCreate]);

  async function createTeam(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await panelApi.createTeam({ name });
      await onCreated(response.data);
      setName("");
      setShowCreate(false);
      feedback.success(`${response.data.name} was created and selected.`);
    } catch (error) {
      feedback.error(error.message || "Could not create team");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={`workspace-switcher ${compact ? "compact-workspace-switcher" : ""}`}
        ref={rootRef}
      >
        <button
          type="button"
          className="workspace"
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Switch team. Current team: ${selectedTeam?.name || "none"}`}
          title={compact ? selectedTeam?.name : undefined}
        >
          <span className="workspace-icon">{teamInitial(selectedTeam)}</span>
          {!compact && (
            <span className="workspace-copy">
              <b>{selectedTeam?.name || "Select a team"}</b>
              <small>{roleLabel(selectedTeam?.role)}</small>
            </span>
          )}
          <ChevronDown size={15} />
        </button>
        {open && (
          <div className="workspace-popover" role="menu" aria-label="Teams">
            <div className="workspace-popover-head">
              <b>Your teams</b>
              <span>{teams.length}</span>
            </div>
            <div className="workspace-team-list">
              {teams.map((team) => (
                <button
                  type="button"
                  role="menuitem"
                  className={team.id === selectedTeam?.id ? "selected" : ""}
                  onClick={() => {
                    onSelect(team);
                    setOpen(false);
                  }}
                  key={team.id}
                >
                  <span className="workspace-icon">{teamInitial(team)}</span>
                  <span>
                    <b>{team.name}</b>
                    <small>{roleLabel(team.role)}</small>
                  </span>
                  {team.id === selectedTeam?.id && <Check size={15} />}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="workspace-create-action"
              onClick={() => {
                setOpen(false);
                setShowCreate(true);
              }}
            >
              <Plus size={15} /> Create team
            </button>
          </div>
        )}
      </div>
      {showCreate && (
        <div
          className="modal-backdrop team-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setShowCreate(false);
          }}
        >
          <section
            className="modal team-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="modal-head">
              <div>
                <h2 id={titleId}>Create a new team</h2>
                <p>Applications, nodes, domains and integrations stay separate.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowCreate(false)}
                aria-label="Close create team dialog"
                disabled={busy}
              >
                <X size={17} />
              </button>
            </div>
            <form className="application-form" onSubmit={createTeam}>
              <label>
                <span>Team name</span>
                <div className="auth-input">
                  <input
                    required
                    minLength="2"
                    maxLength="120"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Legacy Hosting"
                    autoFocus
                  />
                </div>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowCreate(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  Create team
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
