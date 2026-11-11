"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { sendAdminNotification, type AdminManagementData } from "../actions";

export function NotificationsManager({ users }: { users: AdminManagementData["users"] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const filtered = useMemo(() => users.filter((u) => [u.displayName, u.username, u.id].some((v) => v?.toLowerCase().includes(query.toLowerCase().trim()))), [users, query]);
  function toggle(id: string) { setSelected((old) => old.includes(id) ? old.filter((v) => v !== id) : [...old, id]); }
  function submit() {
    if (!selected.length || !title.trim()) { setNotice("Choose at least one user and enter a title."); return; }
    if (!window.confirm(`Send this notification to ${selected.length} selected account(s)?`)) return;
    setNotice("");
    startTransition(() => void sendAdminNotification({ userIds: selected, title, body }).then((result) => {
      setNotice(`Notification created for ${result.sentCount} account(s).`); setSelected([]); setTitle(""); setBody(""); router.refresh();
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message.replaceAll("_", " ").toLowerCase() : "Could not send notification.")));
  }
  return <div className="admin-management">
    {notice ? <div className="admin-notice" role="status">{notice}</div> : null}
    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">CUSTOM MESSAGE</p><h2>Compose notification</h2><p>Creates an in-app security alert for each selected account.</p></div><span className="admin-count">{selected.length} selected</span></div>
      <label className="admin-notification-field">Title <input maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Important account update" /></label>
      <label className="admin-notification-field">Message <textarea maxLength={2000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your notification…" /></label>
      <p className="admin-table-footnote">{title.length}/120 title characters · {body.length}/2000 message characters</p>
    </section>
    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">RECIPIENTS</p><h2>Select accounts</h2><p>Email addresses are hidden. Choose users by profile name or username.</p></div></div>
      <label className="admin-table-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, username, or ID…" /></label>
      <div className="admin-recipient-list">{filtered.map((user) => <label className="admin-recipient" key={user.id}>
        <input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} />
        {user.avatarUrl ? <Image className="admin-user-avatar" src={user.avatarUrl} alt="" width={38} height={38} unoptimized /> : <span className="admin-user-avatar admin-user-avatar-fallback">{(user.displayName || user.username || "?").slice(0, 1).toUpperCase()}</span>}
        <span><strong>{user.displayName || "Unnamed user"}</strong><small>@{user.username || "no-username"} · {user.status}</small></span>
      </label>)}</div>
      <div className="admin-notification-submit"><button className="admin-row-action" disabled={busy || !selected.length || !title.trim()} onClick={submit} type="button">Create notification for {selected.length} user(s)</button></div>
    </section>
    <p className="admin-table-footnote">Recipients are selected from all non-deleted accounts loaded from the database. This writes to OneAuth&apos;s security_notifications table; delivery is in-app, not email/SMS/push.</p>
  </div>;
}
