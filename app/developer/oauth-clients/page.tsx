"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthenticatedShell } from "../../components/AuthenticatedShell";
import { PageHeading, Panel, EmptyState } from "../../components/PortalUI";
import { getDeveloperClients, type DeveloperClient } from "../actions";

export default function OAuthClientsPage() {
  const [clients, setClients] = useState<DeveloperClient[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    getDeveloperClients().then((rows) => { if (active) setClients(rows); })
      .catch(() => { if (active) setError("Could not load organization OAuth clients. Ensure you belong to an organization with Developer or Owner permissions."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <AuthenticatedShell activeLabel="OAuth Clients" activePath="/developer/oauth-clients">
    <PageHeading eyebrow="OAUTH 2.1" title="OAuth clients" description="Client IDs, application types, and registered callback URLs for your organization." actions={<Link className="portal-button portal-button-primary" href="/developer/applications">Manage applications</Link>} />
    <Panel title="Registered OAuth clients">
      {error ? <p className="portal-error" role="alert">{error}</p> : loading ? <p className="portal-muted">Loading OAuth clients…</p> : clients.length ? <div className="developer-client-list">{clients.map((client) => <article className="portal-card developer-client-card" key={client.id}><div className="developer-client-heading"><div><h3>{client.name}</h3><p>{client.description || "No description provided"}</p></div><span className={client.isActive ? "portal-status portal-status-active" : "portal-status"}>{client.isActive ? "Active" : "Disabled"}</span></div><dl><div><dt>Client ID</dt><dd><code>{client.clientId}</code></dd></div><div><dt>Application type</dt><dd>{client.clientType}</dd></div><div><dt>Redirect URIs</dt><dd>{client.redirectUris.length ? client.redirectUris.map((uri) => <code className="developer-redirect-uri" key={uri}>{uri}</code>) : "None configured"}</dd></div></dl></article>)}</div> : <EmptyState title="No OAuth clients yet" description="Register an application to create its OAuth client credentials." />}
    </Panel>
    <Panel title="Environment separation"><p>Keep development and production isolated by registering distinct clients with different callback URLs and credentials. Persisted environment labels and promotion workflows still need a schema migration before they can be configured here.</p></Panel>
  </AuthenticatedShell>;
}