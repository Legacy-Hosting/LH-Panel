import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleX,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";

const FeedbackContext = createContext(null);

const toastIcons = {
  success: CheckCircle2,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
};

const toastTitles = {
  success: "Success",
  error: "Something went wrong",
  warning: "Warning",
  info: "Information",
};

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value)
    throw new Error("useFeedback must be used inside FeedbackProvider");
  return value;
}

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const timers = useRef(new Map());
  const confirmationResolver = useRef(null);

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (type, message, options = {}) => {
      const id = crypto.randomUUID();
      const duration = options.duration ?? (type === "error" ? 8000 : 5000);
      setToasts((current) => [
        ...current,
        {
          id,
          type,
          message,
          title: options.title || toastTitles[type] || toastTitles.info,
        },
      ]);
      if (duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const settleConfirmation = useCallback((result) => {
    const resolve = confirmationResolver.current;
    confirmationResolver.current = null;
    setConfirmation(null);
    resolve?.(result);
  }, []);

  const confirm = useCallback(
    (options) => {
      if (confirmationResolver.current) confirmationResolver.current(false);
      return new Promise((resolve) => {
        confirmationResolver.current = resolve;
        setConfirmation({
          title: options.title || "Confirm action",
          message: options.message || "Are you sure you want to continue?",
          confirmLabel: options.confirmLabel || "Confirm",
          cancelLabel: options.cancelLabel || "Cancel",
          tone: options.tone || "danger",
        });
      });
    },
    [],
  );

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      confirmationResolver.current?.(false);
    },
    [],
  );

  useEffect(() => {
    if (!confirmation) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") settleConfirmation(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmation, settleConfirmation]);

  const value = useMemo(
    () => ({
      notify,
      dismiss,
      confirm,
      success: (message, options) => notify("success", message, options),
      error: (message, options) => notify("error", message, options),
      warning: (message, options) => notify("warning", message, options),
      info: (message, options) => notify("info", message, options),
    }),
    [confirm, dismiss, notify],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div
        className="toast-viewport"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => {
          const Icon = toastIcons[toast.type] || Info;
          return (
            <div
              className={`toast toast-${toast.type}`}
              key={toast.id}
              role={toast.type === "error" ? "alert" : "status"}
            >
              <div className="toast-icon">
                <Icon size={19} />
              </div>
              <div className="toast-copy">
                <b>{toast.title}</b>
                <p>{toast.message}</p>
              </div>
              <button
                className="toast-close"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
      {confirmation && (
        <div
          className="confirmation-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) settleConfirmation(false);
          }}
        >
          <section
            className="confirmation-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmation-title"
            aria-describedby="confirmation-message"
          >
            <div className={`confirmation-icon ${confirmation.tone}`}>
              <CircleAlert size={22} />
            </div>
            <h2 id="confirmation-title">{confirmation.title}</h2>
            <p id="confirmation-message">{confirmation.message}</p>
            <div className="confirmation-actions">
              <button
                className="secondary"
                onClick={() => settleConfirmation(false)}
                autoFocus
              >
                {confirmation.cancelLabel}
              </button>
              <button
                className={`confirmation-submit ${confirmation.tone}`}
                onClick={() => settleConfirmation(true)}
              >
                {confirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
