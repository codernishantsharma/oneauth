"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignAdminAgentDomain, removeAdminAgentDomain } from "./actions";

type User = { id: string; email: string | null; displayName: string | null; username: string | null; status: string };
type Domain = { id: string; userId: string; email: string | null; displayName: string | null; username: string | null; hostname: string; status: string; createdAt: string | Date; lastUsedAt: string | Date };

export function AgentDomainsManager({ users, domains }: { users: User[]; domains: Domain[] }) {
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const activeByUser = useMemo(() => new Set(domains.filter((d) => d.status === "ACTIVE").map((d) => d.userId)), [domains]);
  const availableUsers = users.filter((u) => u.status === "ACTIVE" && !activeByUser.has(u.id));
  const filtered = domains.filter((d) => [d.hostname, d.displayName, d.username, d.email].some((v) => v?.toLowerCase().includes(query.trim().toLowerCase())));

  function assign() {
    if (!userId) { setNotice("Choose an active user."); return; }
    setNotice("");
    startTransition(() => void assignAdminAgentDomain(userId).then((result) => {
      setNotice(`Assigned https://${result.hostname}.`);
      setUserId(""); router.refresh();
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message.replaceAll("_", " ").toLowerCase() : "Could not assign domain.")));
  }

  function remove(domain: Domain) {
    if (!window.confirm(`Remove ${domain.hostname}? This releases the assignment in OneAuth; it does not remove your wildcard DNS record.`)) return;
    setNotice("");
    startTransition(() => void removeAdminAgentDomain(domain.id).then(() => {
      setNotice(`Removed ${domain.hostname}.`); router.refresh();
    }).catch((error: unknown) => setNotice(error instanceof Error ? error.message.replaceAll("_", " ").toLowerCase() : "Could not remove domain.")));
  }

  return <div className="admin-management">
    {notice ? <div className="admin-notice" role="status">{notice}</div> : null}
    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">DOMAIN ASSIGNMENT</p><h2>Assign an Agent domain</h2><p>Create a database-backed MCP URL for an active user. DNS must route *.mcp.nishantapps.in to your MCP gateway; the Agent connects through its authenticated WebSocket.</p></div></div>
      <div className="admin-notification-field"><label htmlFor="agent-domain-user">User account</label><select id="agent-domain-user" value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Select an active user…</option>{availableUsers.map((u) => <option key={u.id} value={u.id}>{u.displayName || u.username || u.email || u.id}{u.username ? ` (@${u.username})` : ""}</option>)}</select></div>
      <div className="admin-notification-submit"><button className="admin-row-action" type="button" disabled={busy || !userId} onClick={assign}>{busy ? "Working…" : "Assign domain"}</button></div>
      {!availableUsers.length ? <p className="admin-table-footnote">No eligible active users without an existing domain assignment.</p> : null}
    </section>
    <section className="portal-card admin-management-panel">
      <div className="admin-management-heading"><div><p className="portal-eyebrow">REGISTRY</p><h2>Manage assigned domains</h2><p>Remove a domain assignment to release it. Reassigning later generates a fresh hostname under *.mcp.nishantapps.in.</p></div><span className="admin-count">{domains.filter((d) => d.status === "ACTIVE").length} active</span></div>
      <label className="admin-table-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hostname or user…" /></label>
      <div className="admin-users-table-wrap"><table className="admin-users-table"><thead><tr><th>User</th><th>Assigned domain</th><th>Status</th><th>Last used</th><th>Assigned</th><th>Action</th></tr></thead><tbody>
        {filtered.map((d) => <tr key={d.id}><td><strong>{d.displayName || d.username || d.email || d.userId}</strong><span>{d.email || (d.username ? `@${d.username}` : d.userId)}</span></td><td><a href={`https://${d.hostname}`} target="_blank" rel="noreferrer">{d.hostname}</a></td><td><span className={`admin-status ${d.status === "ACTIVE" ? "admin-status-active" : "admin-status-suspended"}`}>{d.status}</span></td><td>{new Date(d.lastUsedAt).toLocaleString()}</td><td>{new Date(d.createdAt).toLocaleString()}</td><td>{d.status === "ACTIVE" ? <button className="admin-row-action" type="button" disabled={busy} onClick={() => remove(d)}>Remove</button> : <span>—</span>}</td></tr>)}
        {!filtered.length ? <tr><td colSpan={6}>No matching Agent domains.</td></tr> : null}
      </tbody></table></div>
      <p className="admin-table-footnote">Removing an assignment does not change DNS or terminate an already-open gateway connection. The gateway should reject domains no longer marked ACTIVE.</p>
    </section>
  </div>;
}
