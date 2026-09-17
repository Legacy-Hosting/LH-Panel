import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck, Users } from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "../components/FeedbackProvider.jsx";

export function AdminSettingsPage() {
  const feedback = useFeedback();
  const [registration, setRegistration] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    panelApi
      .registrationSettings()
      .then((response) => {
        if (active) setRegistration(response.data);
      })
      .catch((caught) => {
        if (active)
          setError(caught.message || "Could not load platform settings");
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveRegistration(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await panelApi.updateRegistrationSettings(registration);
      setRegistration(response.data);
      feedback.success("Registration settings saved.");
    } catch (caught) {
      feedback.error(caught.message || "Could not update registration");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      {error && <div className="data-error">{error}</div>}
      <div className="settings-heading">
        <div>
          <h2>Platform access</h2>
          <p>Control who can create a Legacy Hosting account.</p>
        </div>
      </div>
      {registration && (
        <form
          className="settings-card registration-card"
          onSubmit={saveRegistration}
        >
          <div className="settings-card-head">
            <div className="integration-icon access-icon">
              <Users size={21} />
            </div>
            <div>
              <h3>Registration</h3>
              <p>Applies across every Legacy Hosting product</p>
            </div>
          </div>
          <label className="setting-field">
            <span>Registration mode</span>
            <select
              value={registration.mode}
              onChange={(event) =>
                setRegistration({ ...registration, mode: event.target.value })
              }
            >
              <option value="closed">Closed</option>
              <option value="invite_only">Invitation only</option>
              <option value="open">Open</option>
            </select>
          </label>
          <button className="primary save-settings" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
            Save access settings
          </button>
        </form>
      )}
    </div>
  );
}
