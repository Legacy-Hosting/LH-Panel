import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  FileKey2,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";
import { panelApi } from "../api/client.js";
import { useFeedback } from "./FeedbackProvider.jsx";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled"]);

export function PersistentFileModal({
  applicationId,
  path,
  onClose,
  onCompleted,
}) {
  const feedback = useFeedback();
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [restartProcesses, setRestartProcesses] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setContent("");
    setFileName("");
    setRevealed(false);
    setRestartProcesses(true);
    setBusy(false);
    setError("");
  }, [applicationId, path]);

  if (!applicationId || !path) return null;

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 65_536) {
      setError("The selected file is too large. Maximum size is 64 KiB.");
      event.target.value = "";
      return;
    }
    try {
      setContent(await file.text());
      setFileName(file.name);
      setError("");
    } catch {
      setError("The selected file could not be read as text.");
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!content) return;
    const approved = await feedback.confirm({
      title: `Replace ${path}?`,
      message:
        "The current file will be backed up before the new secret content is written.",
      confirmLabel: restartProcesses ? "Replace and restart" : "Replace file",
    });
    if (!approved) return;

    setBusy(true);
    setError("");
    try {
      const queued = await panelApi.writePersistentFile(applicationId, {
        path,
        content,
        restartProcesses,
      });
      let snapshot;
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const response = await panelApi.applicationCommand(
          applicationId,
          queued.data.commandId,
        );
        snapshot = response.data;
        if (terminalStatuses.has(snapshot.status)) break;
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
      }
      if (!snapshot || snapshot.status !== "succeeded")
        throw new Error(
          snapshot?.status === "cancelled"
            ? "Persistent file update was cancelled"
            : "Persistent file update failed",
        );
      setContent("");
      feedback.success(
        restartProcesses
          ? "Secret file updated and application processes restarted."
          : "Secret file updated.",
      );
      await onCompleted?.();
      onClose();
    } catch (caught) {
      const message = caught.message || "Could not update persistent file";
      setError(message);
      feedback.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={busy ? undefined : onClose}
    >
      <section
        className="modal persistent-file-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="persistent-file-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="persistent-file-title">Initialize secret file</h2>
            <p>
              The value is encrypted while queued, written with mode 0600, and
              never returned by the API.
            </p>
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <form className="application-form" onSubmit={submit}>
          {error && <div className="data-error">{error}</div>}
          <div className="persistent-file-path">
            <FileKey2 size={16} /> <code>{path}</code>
          </div>
          <label>
            <span>Upload text file</span>
            <span className="file-picker">
              <Upload size={15} />
              <span>{fileName || "Choose a file"}</span>
              <input type="file" onChange={chooseFile} disabled={busy} />
            </span>
          </label>
          <label>
            <span>Secret file content</span>
            <div className="secret-file-editor">
              <textarea
                className={revealed ? "" : "masked-secret"}
                required
                maxLength="65536"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={busy}
                autoComplete="off"
                spellCheck="false"
              />
              <button
                type="button"
                className="row-action"
                onClick={() => setRevealed((current) => !current)}
                title={revealed ? "Hide secret" : "Show secret"}
                aria-label={revealed ? "Hide secret" : "Show secret"}
                disabled={busy}
              >
                {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <label className="setting-toggle compact-toggle">
            <input
              type="checkbox"
              checked={restartProcesses}
              onChange={(event) => setRestartProcesses(event.target.checked)}
              disabled={busy}
            />
            <span>
              <b>Restart application processes</b>
              <small>Applies the new file immediately after it is written.</small>
            </span>
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy || !content}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <FileKey2 size={16} />
              )}
              {busy ? "Writing securely…" : "Initialize file"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
