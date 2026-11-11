"use client";
import { useEffect, useState } from "react";
import { AuthenticatedShell } from "../../components/AuthenticatedShell";
import { PageHeading, Panel, EmptyState } from "../../components/PortalUI";
import { getDeveloperAuditLogs, type DeveloperAuditEvent } from "./actions";

export default function AuditLogsPage() {
  const [events, setEvents] = useState<DeveloperAuditEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    getDeveloperAuditLogs().then((rows) => { if (active) setEvents(rows); })
      .catch(() => { if (active) setError("Could not load organization audit logs. Select an organization with developer access."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <AuthenticatedShell activeLabel="Audit Logs" activePath="/developer/logs">
    <PageHeading eyebrow="SECURITY & COMPLIANCE" title="Audit logs" description="Recent organization events, including application, membership, and API-key changes." />
    <Panel title="Recent activity">
      {error ? <p className="portal-error" role="alert">{error}</p> : loading ? <p className="portal-muted">Loading audit events…</p> : events.length ? <div className="developer-client-list">{events.map((event) => <article className="portal-card developer-client-card" key={event.id}>
        <div className="developer-client-heading"><div><h3>{event.action}</h3><p>{event.resourceType}{event.resourceId ? " · " + event.resourceId : ""}</p></div><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time></div>
        <p className="portal-muted">Actor: {event.actorEmail ?? "System or unavailable account"}</p>
        {event.metadata && typeof event.metadata === "object" && Object.keys(event.metadata as Record<string, unknown>).length ? <details><summary>Event details</summary><pre>{JSON.stringify(event.metadata, null, 2)}</pre></details> : null}
      </article>)}</div> : <EmptyState title="No audit events yet" description="Organization changes will appear here as they happen." />}
    </Panel>
    <Panel title="Security note"><p>Secrets, API keys, authorization codes, and access tokens must never be written to audit metadata.</p></Panel>
  </AuthenticatedShell>;
}
