"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AuthenticatedShell } from "../components/AuthenticatedShell";
import { EmptyState, MetricCard, PageHeading, Panel, PortalIcon } from "../components/PortalUI";
import { listConnectedApps, revokeConnectedApp, type ConnectedApp } from "./actions";

function formatDate(value: string | null) {
  if (!value) return "Never recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function readableType(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AppsPage() {
  const { t } = useTranslation();
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listConnectedApps();
      setApps(result);
      setSelectedId((current) => current && result.some((app) => app.consentId === current) ? current : result[0]?.consentId ?? null);
    } catch {
      setError("We couldn't load your connected apps. Refresh the page and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const filteredApps = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return apps;
    return apps.filter((app) => `${app.name} ${app.description ?? ""} ${app.clientId} ${app.scopes.join(" ")}`.toLowerCase().includes(query));
  }, [apps, search]);
  const selected = apps.find((app) => app.consentId === selectedId) ?? null;
  const totalTokens = apps.reduce((total, app) => total + app.activeTokens, 0);

  async function revoke(app: ConnectedApp) {
    if (!window.confirm(`Revoke ${app.name}'s access to your OneAuth account? Its current access and refresh tokens will be revoked.`)) return;
    setBusyId(app.consentId);
    setError(null);
    setNotice(null);
    try {
      await revokeConnectedApp(app.consentId);
      setApps((current) => current.filter((item) => item.consentId !== app.consentId));
      setSelectedId((current) => current === app.consentId ? null : current);
      setNotice(`${app.name} has been disconnected. Its OAuth tokens have been revoked.`);
    } catch {
      setError("We couldn't revoke this app's access. Please refresh and try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AuthenticatedShell activeLabel="Connected Apps" activePath="/apps">
      <PageHeading
        actions={<button className="portal-button portal-button-secondary" disabled={loading} onClick={() => void refresh()} type="button"><PortalIcon name="refresh-cw" /> {t("Refresh status")}</button>}
        description="Review applications that have access to your profile and revoke permissions you no longer want to share."
        eyebrow="IDENTITY & PERMISSIONS"
        title="Connected applications"
      />

      <div className="zero-trust-banner">
        <span className="zero-trust-pulse" />
        <span><b>{t("AUTHORIZATION STATUS")}</b><small>{loading ? "Checking grants…" : `${apps.length} active grant${apps.length === 1 ? "" : "s"} found`} <span className="zero-trust-check">· Your account</span></small></span>
      </div>

      {error ? <div className="passkeys-notice passkeys-notice-error" role="alert"><PortalIcon name="alert-circle" /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button></div> : null}
      {notice ? <div className="passkeys-notice passkeys-notice-success" role="status"><PortalIcon name="check-circle" /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">×</button></div> : null}

      <div className="portal-metrics-grid portal-metrics-three">
        <MetricCard detail="Applications with active consent" icon="app-window" label="Authorized apps" value={loading ? "…" : String(apps.length)} />
        <MetricCard detail="Active consent grants waiting for review" icon="shield-check" label="Pending grants" value={loading ? "…" : "0"} />
        <MetricCard detail="Unexpired, non-revoked access tokens" icon="key-round" label="Active OAuth tokens" value={loading ? "…" : String(totalTokens)} />
      </div>

      <div className="apps-layout">
        <div className="apps-main-column">
          <Panel title="Authorized applications" action={<span className="panel-count">{loading ? "LOADING" : `${filteredApps.length} SHOWN`}</span>}>
            <label className="apps-filter"><PortalIcon name="search" /><input aria-label="Search connected apps" placeholder="Search apps, client IDs, permissions…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            {loading ? <div className="apps-loading" role="status">Loading connected applications…</div> : filteredApps.length ? (
              <div className="authorized-app-list">
                {filteredApps.map((app) => (
                  <button className={`authorized-app connected-app-row${selectedId === app.consentId ? " connected-app-row-selected" : ""}`} key={app.consentId} onClick={() => setSelectedId(app.consentId)} type="button" aria-pressed={selectedId === app.consentId}>
                    <span className="connected-app-icon"><PortalIcon name="app-window" /></span>
                    <span className="authorized-app-body">
                      <strong>{app.name}</strong>
                      <span className="app-category-badge">{readableType(app.clientType)}</span>
                      <span className="authorized-date">Connected {formatDate(app.connectedAt)} <span>·</span> {app.scopes.length} permission{app.scopes.length === 1 ? "" : "s"}</span>
                      <span className="scope-chip-list">{app.scopes.slice(0, 4).map((scope) => <span key={scope}>{scope}</span>)}{app.scopes.length > 4 ? <span>+{app.scopes.length - 4} more</span> : null}</span>
                    </span>
                    <span className="connected-app-chevron"><PortalIcon name="chevron-right" /></span>
                  </button>
                ))}
              </div>
            ) : <EmptyState description={search ? "Try a different search term." : "When you approve an application in the OneAuth consent screen, its permissions and connection details will appear here."} title={search ? "No matching applications" : "No connected applications"} />}
          </Panel>
          <div className="apps-assurance"><span className="assurance-icon">◇</span><span><b>{t("Review access carefully")}</b><small>Disconnecting an app revokes its current access and refresh tokens. The app will need your approval again before it can access your account.</small></span></div>
        </div>

        <aside className="apps-inspector">
          <Panel title="Application details">
            {selected ? <>
              <div className="inspector-app"><span className="connected-app-icon"><PortalIcon name="app-window" /></span><div><strong>{selected.name}</strong><small>{readableType(selected.clientType)} · {selected.environment}</small></div></div>
              {selected.description ? <p className="connected-app-description">{selected.description}</p> : null}
              <div className="connected-app-detail"><span>Client ID</span><code>{selected.clientId}</code><button className="icon-button" type="button" aria-label="Copy client ID" onClick={() => { void navigator.clipboard.writeText(selected.clientId); setNotice("Client ID copied."); }}><PortalIcon name="copy" /></button></div>
              <div className="connected-app-detail"><span>Connected</span><strong>{formatDate(selected.connectedAt)}</strong></div>
              <div className="connected-app-detail"><span>Last token issued</span><strong>{formatDate(selected.lastUsedAt)}</strong></div>
              <div className="connected-app-detail"><span>Active access tokens</span><strong>{selected.activeTokens}</strong></div>
              <div className="connected-app-scopes"><h3>Granted permissions</h3>{selected.scopes.length ? <ul>{selected.scopes.map((scope) => <li key={scope}><code>{scope}</code></li>)}</ul> : <p>No scope details were recorded for this grant.</p>}</div>
              <button className="portal-button portal-button-danger connected-app-revoke" disabled={busyId === selected.consentId} onClick={() => void revoke(selected)} type="button"><PortalIcon name="shield-off" /> {busyId === selected.consentId ? "Disconnecting…" : "Revoke access"}</button>
            </> : <EmptyState description={loading ? "Loading your active grants." : "Select an application to review its permissions and disconnect it."} title={loading ? "Please wait" : "No application selected"} />}
          </Panel>
          <p className="connected-app-help">Need to connect a new integration? <Link href="/developer">Visit the developer portal</Link>.</p>
        </aside>
      </div>
    </AuthenticatedShell>
  );
}
