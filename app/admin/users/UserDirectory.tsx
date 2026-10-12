"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { bulkAdminUserAction, type AdminManagementData } from "../actions";

type User = AdminManagementData["users"][number];

export function UserDirectory({ initialUsers }: { initialUsers: User[] }) {
  const [users] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const visible = useMemo(() => users.filter((user) =>
    (status === "ALL" || user.status === status) &&
    [user.displayName, user.username, user.id].some((v) => v?.toLowerCase().includes(query.toLowerCase().trim())),
  ), [users, query, status]);
  const allVisibleSelected = visible.length > 0 && visible.every((user) => selected.includes(user.id));

  function toggleOne(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function bulkAction(action: "ACTIVE" | "SUSPENDED" | "DELETED") {
    const ids = selected.filter((id) => id);
    if (!ids.length) return;
    const verb = action === "DELETED" ? "soft-delete" : action === "SUSPENDED" ? "suspend" : "reactivate";
    if (!window.confirm(`Are you sure you want to ${verb} ${ids.length} selected account(s)?${action === "DELETED" ? " This will revoke sessions and OAuth tokens." : ""}`)) return;
    startTransition(() => {
      void bulkAdminUserAction(ids, action).then((result) => {
        setNotice(`Completed: ${result.successCount}; failed: ${result.failureCount}.`);
        setSelected([]);
        router.refresh();
        window.location.reload();
      }).catch((error: unknown) => setNotice(error instanceof Error ? error.message.replaceAll("_", " ").toLowerCase() : "Action failed."));
    });
  }

  return <div className="admin-management">
    <div className="admin-directory-toolbar">
      <label className="admin-table-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, username, or user ID…" /></label>
      <select aria-label="Filter users by status" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option>
      </select>
    </div>
    <div className="admin-bulk-toolbar">
      <label><input type="checkbox" checked={allVisibleSelected} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...visible.map((u) => u.id)])] : selected.filter((id) => !visible.some((u) => u.id === id)))} /> Select visible ({selected.length} selected)</label>
      <div>
        <button disabled={busy || !selected.length} onClick={() => bulkAction("ACTIVE")} type="button">Reactivate</button>
        <button disabled={busy || !selected.length} onClick={() => bulkAction("SUSPENDED")} type="button">Suspend</button>
        <button className="admin-row-action-danger" disabled={busy || !selected.length} onClick={() => bulkAction("DELETED")} type="button">Delete selected</button>
      </div>
    </div>
    {notice ? <p className="admin-table-footnote" role="status">{notice}</p> : null}
    <div className="admin-users-table-wrap"><table className="admin-users-table">
      <thead><tr><th></th><th>Account</th><th>Status</th><th>Registered</th><th>Account details</th></tr></thead>
      <tbody>{visible.map((user) => <tr key={user.id}>
        <td><input aria-label={`Select ${user.displayName || user.username || user.id}`} type="checkbox" checked={selected.includes(user.id)} onChange={() => toggleOne(user.id)} /></td>
        <td><div className="admin-user-identity">
          {user.avatarUrl ? <Image className="admin-user-avatar" src={user.avatarUrl} alt="" width={38} height={38} unoptimized /> : <span className="admin-user-avatar admin-user-avatar-fallback">{(user.displayName || user.username || "?").slice(0, 1).toUpperCase()}</span>}
          <span><strong>{user.displayName || "Unnamed user"}</strong><span>@{user.username || "no-username"}</span><code>{user.id}</code></span>
        </div></td>
        <td><span className={`admin-status admin-status-${user.status.toLowerCase()}`}>{user.status}</span></td>
        <td>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(user.createdAt))}</td>
        <td><Link className="admin-row-action" href={`/admin/users/${user.id}`}>View account ↗</Link></td>
      </tr>)}
      {!visible.length ? <tr><td colSpan={5}>No accounts match your filters.</td></tr> : null}</tbody>
    </table></div>
    <p className="admin-table-footnote">Up to 100 recent non-deleted accounts are loaded. Email addresses are deliberately not displayed. Deletion is a soft delete and revokes active access.</p>
  </div>;
}
