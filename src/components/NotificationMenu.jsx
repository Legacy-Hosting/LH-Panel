import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { panelApi } from "../api/client.js";

function relativeTime(value) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

const severityIcons = {
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef(null);

  async function load() {
    try {
      const response = await panelApi.notifications();
      setNotifications(response.data);
      setUnread(response.meta.unread);
    } catch {
      // The rest of the panel remains usable if notifications are unavailable.
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnNavigation = () => setOpen(false);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("popstate", closeOnNavigation);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("popstate", closeOnNavigation);
    };
  }, [open]);

  async function markRead(notification) {
    if (!notification.readAt) await panelApi.readNotification(notification.id);
    await load();
  }

  async function markAllRead() {
    await panelApi.readAllNotifications();
    await load();
  }

  return (
    <div className="notification-menu" ref={menuRef}>
      <button
        className="icon-btn notification-trigger"
        onClick={() => {
          setOpen(!open);
          if (!open) load();
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && <span>{Math.min(unread, 99)}</span>}
      </button>
      {open && (
        <div
          aria-label="Notifications"
          className="notification-popover"
          role="dialog"
        >
          <div className="notification-head">
            <div><h3>Notifications</h3><p>{unread} unread</p></div>
            {unread > 0 && (
              <button onClick={markAllRead}><CheckCheck size={14} /> Mark all read</button>
            )}
          </div>
          <div className="notification-list">
            {notifications.length === 0 && <div className="notification-empty">No notifications yet.</div>}
            {notifications.map((notification) => {
              const Icon = severityIcons[notification.severity] || Info;
              return (
                <button
                  className={`notification-item ${notification.readAt ? "read" : ""}`}
                  onClick={() => markRead(notification)}
                  key={notification.id}
                >
                  <span className={`notification-icon ${notification.severity}`}><Icon size={16} /></span>
                  <span><b>{notification.title}</b><small>{notification.message}</small><time>{relativeTime(notification.createdAt)}</time></span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
