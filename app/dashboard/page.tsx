import Link from "next/link";

import { getDashboardData, getPortalHeaderUser } from "@/app/actions";
import { AuthenticatedShell } from "../components/AuthenticatedShell";
import { EmptyState, MetricCard, PageHeading, Panel, PortalIcon } from "../components/PortalUI";

export default async function DashboardPage() {
  const [data, portalUser] = await Promise.all([getDashboardData(), getPortalHeaderUser()]);
  const rawUser = data.user;
  const user = {
    email: String(rawUser.email ?? ""),
    username: rawUser.username == null ? null : String(rawUser.username),
    displayName: rawUser.displayName == null ? null : String(rawUser.displayName),
    status: String(rawUser.status ?? "Unknown")
      .split(/[ _-]+/)
      .map((part) => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part)
      .join(" "),
  };
  const metrics = {
    activeSessions: Number(data.metrics.activeSessions ?? 0),
    passkeys: Number(data.metrics.passkeys ?? 0),
    connectedApps: Number(data.metrics.connectedApps ?? 0),
    recentSecurityEvents: Number(data.metrics.recentSecurityEvents ?? 0),
  };

  return (
    <AuthenticatedShell activeLabel="Overview" activePath="/dashboard" user={user}>
      <PageHeading
        actions={
          <>
            <Link className="portal-button portal-button-secondary" href="/developer">
              <PortalIcon name="app-window" /> Developer portal
            </Link>
            <Link className="portal-button portal-button-primary" href="/security">
              <PortalIcon name="shield-check" /> Security settings
            </Link>
          </>
        }
        description="Manage your identity, security settings, and connected applications."
        eyebrow="ACCOUNT OVERVIEW"
        title="Your account"
      />

      <section className="portal-card identity-card" id="profile">
        <div className="identity-symbol">{portalUser?.avatarUrl ? <img className="identity-avatar-image" src={portalUser.avatarUrl} alt="Your profile picture" /> : <PortalIcon name="user-round" />}</div>
        <div className="identity-details">
          <p className="identity-email">{user.email || "Profile information"}</p>
          <p className="identity-status">
            {`${user.displayName || user.username || "OneAuth member"} · ${user.status} account`}
          </p>
        </div>
        <div className="identity-actions">
          <Link className="portal-button portal-button-secondary" href="/security"><PortalIcon name="shield-check" /> Manage security</Link>
          <Link className="portal-button portal-button-primary" href="/apps"><PortalIcon name="app-window" /> Connected Apps</Link>
        </div>
      </section>

      <div className="portal-metrics-grid">
        <MetricCard detail="Account state" icon="shield-check" label="Account status" value={user.status} />
        <MetricCard detail="Registered credentials" icon="key-round" label="Passkeys" value={String(metrics.passkeys)} />
        <MetricCard detail="Valid, non-revoked sessions" icon="monitor" label="Active Sessions" value={String(metrics.activeSessions)} />
        <MetricCard detail="Active application grants" icon="app-window" label="Connected Apps" value={String(metrics.connectedApps)} />
      </div>

      <Panel
        action={<Link className="portal-text-link" href="/apps">Manage connected apps →</Link>}
        title="Connected applications"
      >
        {metrics.connectedApps > 0 ? (
          <p>{metrics.connectedApps} active application grant{metrics.connectedApps === 1 ? "" : "s"}.</p>
        ) : (
          <EmptyState
            description="Applications will appear here after you authorize them."
            title="No connected applications"
          />
        )}
      </Panel>

      <div className="portal-dashboard-bottom">
        <Panel
          action={<Link className="portal-text-link" href="/activity">View activity log →</Link>}
          id="activity"
          title="Security activity"
        >
          <p>{metrics.recentSecurityEvents} security events in the last 30 days.</p>
          <Link className="portal-text-link" href="/activity">Open Security Activity →</Link>
        </Panel>

        <Panel
          action={<Link className="portal-text-link" href="/security#sessions">Manage sessions →</Link>}
          title="Active sessions"
        >
          <p>{metrics.activeSessions} active session{metrics.activeSessions === 1 ? "" : "s"} for this account.</p>
        </Panel>
      </div>
    </AuthenticatedShell>
  );
}
