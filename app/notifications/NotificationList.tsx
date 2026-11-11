"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markMyNotificationRead, type UserNotification } from "./actions";

export function NotificationList({ initialNotifications }: { initialNotifications: UserNotification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState("");
  const unread = notifications.filter((notification) => !notification.readAt).length;
  const router = useRouter();

  function markRead(notification: UserNotification) {
    setError("");
    startTransition(() => void markMyNotificationRead(notification.id).then(() => {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
      router.refresh();
    }).catch(() => setError("Could not update this notification. Please try again.")));
  }

  return <div className="admin-management">
    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">YOUR INBOX</p><h2>Notifications</h2><p>Important security alerts and messages for your account.</p></div><span className="admin-count">{unread} unread</span></div>
      {error ? <p role="alert" className="admin-notice admin-notice-error">{error}</p> : null}
      <div className="user-notification-list">
        {notifications.map((notification) => <article className={`user-notification ${notification.readAt ? "user-notification-read" : ""}`} key={notification.id}>
          <span className="user-notification-mark" aria-hidden="true">{notification.readAt ? "✓" : "!"}</span>
          <div className="user-notification-content"><div><strong>{notification.title}</strong><span>{notification.type.replaceAll("_", " ")}</span></div>
            {notification.body ? <p>{notification.body}</p> : null}
            <small>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.createdAt))}</small>
          </div>
          {!notification.readAt ? <button className="admin-row-action" disabled={busy} onClick={() => markRead(notification)} type="button">Mark read</button> : <span className="admin-table-footnote">Read</span>}
        </article>)}
        {!notifications.length ? <p className="admin-empty">You&apos;re all caught up. No notifications yet.</p> : null}
      </div>
    </section>
  </div>;
}
