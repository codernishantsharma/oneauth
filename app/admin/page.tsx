import { db } from "@/src/prisma/db";
import { requireAdminUser } from "@/src/lib/auth/admin";
import { AuthenticatedShell } from "../components/AuthenticatedShell";
import { MetricCard, PageHeading } from "../components/PortalUI";
import { SharedTunnelMigration } from "./SharedTunnelMigration";

export const dynamic = "force-dynamic";

type AdminStats = {
  users: number;
  activeUsers: number;
  activeSessions: number;
  oauthClients: number;
  recentSecurityEvents: number;
};

type AdminTunnelRow = {
  id: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  username: string | null;
  hostname: string;
  localPort: number;
  status: string;
  createdAt: Date | string;
  lastUsedAt: Date | string;
};

type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  username: string | null;
  status: string;
  createdAt: Date | string;
};

async function getAdminData(): Promise<{ stats: AdminStats; users: AdminUserRow[]; tunnels: AdminTunnelRow[] }> {
  const statsQuery = db.raw.sql`SELECT
    (SELECT count(*)::int4 FROM public.users WHERE status <> 'DELETED') AS users,
    (SELECT count(*)::int4 FROM public.users WHERE status = 'ACTIVE') AS active_users,
    (SELECT count(*)::int4 FROM public.sessions WHERE revoked_at IS NULL AND expires_at > now()) AS active_sessions,
    (SELECT count(*)::int4 FROM public.oauth_clients) AS oauth_clients,
    (SELECT count(*)::int4 FROM public.security_events WHERE occurred_at >= now() - interval '24 hours') AS recent_security_events
  `.returnsRow({
    users: "pg/int4@1",
    active_users: "pg/int4@1",
    active_sessions: "pg/int4@1",
    oauth_clients: "pg/int4@1",
    recent_security_events: "pg/int4@1",
  }).build();

  const usersQuery = db.raw.sql`SELECT u.id,
      e.normalized_email AS email,
      p.display_name AS "displayName",
      p.username,
      u.status,
      u.created_at AS "createdAt"
    FROM public.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    LEFT JOIN public.email_addresses e ON e.user_id = u.id AND e.is_primary = true
    WHERE u.status <> 'DELETED'
    ORDER BY u.created_at DESC
    LIMIT 10`.returnsRow({
      id: "pg/uuid@1",
      email: "pg/text@1",
      displayName: "pg/text@1",
      username: "pg/text@1",
      status: "pg/text@1",
      createdAt: "pg/timestamptz-date@1",
    }).build();

  const tunnelsQuery = db.raw.sql`SELECT t.id, t.user_id AS "userId",
      e.normalized_email AS email, p.display_name AS "displayName", p.username,
      t.hostname, t.local_port AS "localPort", t.status, t.created_at AS "createdAt", t.last_used_at AS "lastUsedAt"
    FROM public.agent_tunnels t
    JOIN public.users u ON u.id = t.user_id
    LEFT JOIN public.profiles p ON p.user_id = u.id
    LEFT JOIN public.email_addresses e ON e.user_id = u.id AND e.is_primary = true
    ORDER BY CASE WHEN t.status = 'ACTIVE' THEN 0 ELSE 1 END, t.last_used_at DESC
    LIMIT 100`.returnsRow({
      id: "pg/uuid@1",
      userId: "pg/uuid@1",
      email: "pg/text@1",
      displayName: "pg/text@1",
      username: "pg/text@1",
      hostname: "pg/text@1",
      localPort: "pg/int4@1",
      status: "pg/text@1",
      createdAt: "pg/timestamptz-date@1",
      lastUsedAt: "pg/timestamptz-date@1",
    }).build();

  const [statsRows, users, tunnels] = await Promise.all([
    db.runtime().query(statsQuery),
    db.runtime().query(usersQuery),
    db.runtime().query(tunnelsQuery),
  ]);
  const row = statsRows[0];
  if (!row) throw new Error("ADMIN_DASHBOARD_UNAVAILABLE");

  return {
    stats: {
      users: row.users,
      activeUsers: row.active_users,
      activeSessions: row.active_sessions,
      oauthClients: row.oauth_clients,
      recentSecurityEvents: row.recent_security_events,
    },
    users: users as AdminUserRow[],
    tunnels: tunnels as AdminTunnelRow[],
  };
}


function formatAdminDate(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AdminPage() {
  const user = await requireAdminUser();
  const data = await getAdminData();

  return (
    <AuthenticatedShell
      activeLabel="Admin Console"
      activePath="/admin"
      user={{
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: "ADMIN",
      }}
    >
      <div id="overview" className="admin-section-anchor">
      <PageHeading
        description="Monitor platform-wide identity activity and account health. Administrative access is restricted to configured administrators."
        eyebrow="ONEAUTH ADMINISTRATION"
        title="Admin console"
      />

      </div>

      <div className="portal-metrics-grid admin-metrics-grid">
        <MetricCard detail="Non-deleted accounts" icon="user-round" label="Total users" value={String(data.stats.users)} />
        <MetricCard detail="Accounts in active state" icon="shield-check" label="Active users" value={String(data.stats.activeUsers)} />
        <MetricCard detail="Unrevoked, unexpired sessions" icon="monitor" label="Active sessions" value={String(data.stats.activeSessions)} />
        <MetricCard detail="Registered OAuth clients" icon="app-window" label="OAuth clients" value={String(data.stats.oauthClients)} />
        <MetricCard detail="Events in the last 24 hours" icon="activity" label="Recent security events" value={String(data.stats.recentSecurityEvents)} />
      </div>

      <section aria-labelledby="agent-domains-heading" className="portal-card admin-management-panel admin-section-anchor" id="agent-domains">
        <SharedTunnelMigration activeCount={data.tunnels.filter((tunnel) => tunnel.status === "ACTIVE").length} />
        <div className="admin-management-heading">
          <div>
            <p className="portal-eyebrow">VORTIQLABS AGENT</p>
            <h2 id="agent-domains-heading">Assigned tunnel domains</h2>
            <p>View the public hostname assigned to each Agent installation.</p>
          </div>
          <span className="admin-count">{data.tunnels.filter((tunnel) => tunnel.status === "ACTIVE").length} active</span>
        </div>
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead><tr><th>User</th><th>Assigned domain</th><th>Local port</th><th>Status</th><th>Last used</th><th>Assigned</th></tr></thead>
            <tbody>
              {data.tunnels.map((tunnel) => (
                <tr key={tunnel.id}>
                  <td><strong>{tunnel.displayName || tunnel.username || tunnel.email || tunnel.userId}</strong><span>{tunnel.email || (tunnel.username ? `@${tunnel.username}` : tunnel.userId)}</span></td>
                  <td><a href={`https://${tunnel.hostname}`} rel="noreferrer" target="_blank">{tunnel.hostname}</a></td>
                  <td><code>{tunnel.localPort}</code></td>
                  <td><span className={`admin-status ${tunnel.status === "ACTIVE" ? "admin-status-active" : "admin-status-suspended"}`}>{tunnel.status}</span></td>
                  <td>{formatAdminDate(tunnel.lastUsedAt)}</td>
                  <td>{formatAdminDate(tunnel.createdAt)}</td>
                </tr>
              ))}
              {!data.tunnels.length ? <tr><td colSpan={6}>No Agent tunnel domains have been assigned yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <p className="admin-table-footnote">Showing up to 100 most recently used tunnel assignments. Local port is the port reported by the Agent extension; it must match the port the extension actually listens on.</p>
      </section>

      <p className="admin-access-note">Signed in as {user.email}. Admin access is controlled server-side by the ONEAUTH_ADMIN_EMAILS environment variable.</p>
    </AuthenticatedShell>
  );
}
