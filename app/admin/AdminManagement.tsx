"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getAdminManagementData,
  revokeAdminSession,
  setAdminOAuthClientStatus,
  type AdminClientItem,
  type AdminEventItem,
  type AdminManagementData,
  type AdminSessionItem,
} from "./actions";

type Props = { initialData: AdminManagementData; section?: "clients" | "sessions" | "events" };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function searchMatches(values: Array<string | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  return !normalized || values.some((value) => value?.toLowerCase().includes(normalized));
}

export function AdminManagement({ initialData, section = "clients" }: Props) {
  const [data, setData] = useState(initialData);
  const [sessionSearch, setSessionSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [eventType, setEventType] = useState("ALL");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const next = await getAdminManagementData();
      setData(next);
    } catch {
      setNotice({ tone: "error", message: "Could not refresh admin data. Check your admin session and try again." });
    }
  }, []);


  const sessions = useMemo(
    () => data.sessions.filter((session) => searchMatches([session.displayName, session.userId, session.ipAddress, session.userAgent, session.id], sessionSearch)),
    [data.sessions, sessionSearch],
  );
  const clients = useMemo(
    () => data.clients.filter((client) => searchMatches([client.name, client.clientId, client.clientType, client.description], clientSearch)),
    [data.clients, clientSearch],
  );
  const events = useMemo(
    () => data.events.filter((event) =>
      (eventType === "ALL" || event.eventType === eventType) &&
      searchMatches([event.eventType, event.displayName, event.username, event.ipAddress, event.userAgent, event.id, ...Object.values(event.metadata ?? {}).map(String)], eventSearch),
    ),
    [data.events, eventSearch, eventType],
  );

  function perform<T>(operation: () => Promise<T>, successMessage: string) {
    setNotice(null);
    startTransition(() => {
      void operation()
        .then(async () => {
          setNotice({ tone: "success", message: successMessage });
          await refresh();
          router.refresh();
        })
        .catch((error: unknown) => {
          setNotice({
            tone: "error",
            message: error instanceof Error ? error.message.replaceAll("_", " ").toLowerCase() : "The action could not be completed.",
          });
        });
    });
  }


  function revokeSession(session: AdminSessionItem) {
    if (!window.confirm(`Revoke this session for ${session.displayName ?? session.userId}?`)) return;
    perform(() => revokeAdminSession(session.id), "Session revoked successfully.");
  }

  function toggleClient(client: AdminClientItem) {
    const next = !client.isActive;
    if (!window.confirm(`${next ? "Enable" : "Disable"} OAuth client “${client.name}”?`)) return;
    perform(() => setAdminOAuthClientStatus(client.id, next), `OAuth client ${next ? "enabled" : "disabled"} successfully.`);
  }

  return (
    <div className="admin-management">
      {notice ? (
        <div className={`admin-notice admin-notice-${notice.tone}`} role="status">
          <span>{notice.message}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice(null)} type="button">×</button>
        </div>
      ) : null}



      {section === "clients" ? (
      <section aria-labelledby="clients-heading" className="portal-card admin-management-panel admin-section-anchor" id="oauth-clients">
        <div className="admin-management-heading">
          <div><p className="portal-eyebrow">APPLICATION ACCESS</p><h2 id="clients-heading">OAuth clients</h2><p>Review registered clients and enable or disable their access.</p></div>
          <span className="admin-count">{clients.length} shown</span>
        </div>
        <label className="admin-table-search"><span aria-hidden="true">⌕</span><input onChange={(event) => setClientSearch(event.target.value)} placeholder="Search client, owner, type…" value={clientSearch} /></label>
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead><tr><th>Client</th><th>Owner</th><th>Type</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td><strong>{client.name}</strong><span>{client.description || client.clientId}</span></td>
                  <td>Platform client</td><td>{client.clientType}</td>
                  <td><span className={`admin-status ${client.isActive ? "admin-status-active" : "admin-status-suspended"}`}>{client.isActive ? "ACTIVE" : "DISABLED"}</span></td>
                  <td>{formatDate(client.createdAt)}</td>
                  <td><button className="admin-row-action" disabled={pending} onClick={() => toggleClient(client)} type="button">{client.isActive ? "Disable" : "Enable"}</button></td>
                </tr>
              ))}
              {!clients.length ? <tr><td colSpan={6}>No OAuth clients match your search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {section === "sessions" ? (
      <section aria-labelledby="sessions-heading" className="portal-card admin-management-panel admin-section-anchor" id="sessions">
        <div className="admin-management-heading">
          <div><p className="portal-eyebrow">LIVE ACCESS</p><h2 id="sessions-heading">Active sessions</h2><p>Revoke a session to immediately invalidate it.</p></div>
          <span className="admin-count">{sessions.filter((session) => session.isActive).length} active</span>
        </div>
        <label className="admin-table-search"><span aria-hidden="true">⌕</span><input onChange={(event) => setSessionSearch(event.target.value)} placeholder="Search user, IP, device, session ID…" value={sessionSearch} /></label>
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead><tr><th>User / device</th><th>IP address</th><th>Last seen</th><th>Expires</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td><strong>{session.displayName || session.userId}</strong><span>{session.userId}</span><span>{session.userAgent || "Unknown device"}</span></td>
                  <td>{session.ipAddress || "—"}</td><td>{formatDate(session.lastSeenAt)}</td><td>{formatDate(session.expiresAt)}</td>
                  <td><span className={`admin-status ${session.isActive ? "admin-status-active" : ""}`}>{session.isActive ? "ACTIVE" : "ENDED"}</span></td>
                  <td>{session.isActive ? <button className="admin-row-action admin-row-action-danger" disabled={pending} onClick={() => revokeSession(session)} type="button">Revoke</button> : "—"}</td>
                </tr>
              ))}
              {!sessions.length ? <tr><td colSpan={6}>No sessions match your search.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="admin-table-footnote">Showing up to the 100 most recently active sessions.</p>
      </section>
      ) : null}

      {section === "events" ? (
      <section aria-labelledby="events-heading" className="portal-card admin-management-panel admin-section-anchor" id="security-events">
        <div className="admin-management-heading">
          <div><p className="portal-eyebrow">AUDIT TRAIL</p><h2 id="events-heading">Security events</h2><p>Platform-wide authentication and security activity.</p></div>
          <span className="admin-count">{events.length} shown</span>
        </div>
        <div className="admin-event-toolbar">
          <label className="admin-table-search"><span aria-hidden="true">⌕</span><input onChange={(event) => setEventSearch(event.target.value)} placeholder="Search email, IP, event…" value={eventSearch} /></label>
          <select aria-label="Filter security events by type" onChange={(event) => setEventType(event.target.value)} value={eventType}>
            <option value="ALL">All event types</option>
            {[...new Set(data.events.map((event) => event.eventType))].sort().map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
          </select>
        </div>
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead><tr><th>Event</th><th>User</th><th>IP address</th><th>Device</th><th>Time</th></tr></thead>
            <tbody>
              {events.map((event: AdminEventItem) => (
                <tr key={event.id}>
                  <td><strong>{event.eventType.replaceAll("_", " ")}</strong><span>{event.id}</span></td>
                  <td>{event.displayName || (event.username ? `@${event.username}` : "System / unknown")}</td><td>{event.ipAddress || "—"}</td><td>{event.userAgent || "—"}</td><td>{formatDate(event.occurredAt)}</td>
                </tr>
              ))}
              {!events.length ? <tr><td colSpan={5}>No security events match your filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="admin-table-footnote">Showing the 100 most recent security events. This log is read-only.</p>
      </section>
      ) : null}
    </div>
  );
}
