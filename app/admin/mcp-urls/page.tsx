import { db } from "@/src/prisma/db";
import { requireAdminUser } from "@/src/lib/auth/admin";
import { AdminSectionLayout } from "../AdminSectionLayout";
import { AgentDomainsManager } from "../AgentDomainsManager";

export const dynamic = "force-dynamic";

type User = { id: string; email: string | null; displayName: string | null; username: string | null; status: string };
type Domain = { id: string; userId: string; email: string | null; displayName: string | null; username: string | null; hostname: string; status: string; createdAt: Date | string; lastUsedAt: Date | string };

export default async function AdminMcpUrlsPage() {
  const user = await requireAdminUser();
  const usersQuery = db.raw.sql`SELECT u.id, e.normalized_email AS email, p.display_name AS "displayName", p.username, u.status
    FROM public.users u LEFT JOIN public.profiles p ON p.user_id=u.id
    LEFT JOIN public.email_addresses e ON e.user_id=u.id AND e.is_primary=true
    WHERE u.status <> 'DELETED' ORDER BY u.created_at DESC LIMIT 500`.returnsRow({
      id: "pg/uuid@1", email: "pg/text@1", displayName: "pg/text@1", username: "pg/text@1", status: "pg/text@1",
    }).build();
  const domainsQuery = db.raw.sql`SELECT d.id, d.user_id AS "userId", e.normalized_email AS email, p.display_name AS "displayName", p.username,
      d.hostname, d.status, d.created_at AS "createdAt", d.last_used_at AS "lastUsedAt"
    FROM public.agent_domains d JOIN public.users u ON u.id=d.user_id
    LEFT JOIN public.profiles p ON p.user_id=u.id
    LEFT JOIN public.email_addresses e ON e.user_id=u.id AND e.is_primary=true
    ORDER BY CASE WHEN d.status='ACTIVE' THEN 0 ELSE 1 END, d.last_used_at DESC LIMIT 500`.returnsRow({
      id: "pg/uuid@1", userId: "pg/uuid@1", email: "pg/text@1", displayName: "pg/text@1", username: "pg/text@1",
      hostname: "pg/text@1", status: "pg/text@1", createdAt: "pg/timestamptz-date@1", lastUsedAt: "pg/timestamptz-date@1",
    }).build();
  const [users, domains] = await Promise.all([db.runtime().query(usersQuery), db.runtime().query(domainsQuery)]);
  return <AdminSectionLayout activePath="/admin/mcp-urls" title="MCP URLs" eyebrow="AGENT GATEWAY"
    description="Assign and manage public MCP hostnames for connected Agent installations. Each URL maps to an authenticated live WebSocket session."
    user={{ email: user.email, username: user.username, displayName: user.displayName, role: "ADMIN" }}>
    <div className="portal-card admin-management-panel" style={{ marginBottom: 20 }}>
      <p className="portal-eyebrow">WILDCARD CONFIGURATION</p>
      <h2>*.mcp.nishantapps.in</h2>
      <p>Point this wildcard DNS record to the public MCP Mesh gateway. OneAuth stores URL ownership; MCP Mesh handles live Agent connections and request routing.</p>
    </div>
    <AgentDomainsManager users={users as User[]} domains={domains as Domain[]} />
  </AdminSectionLayout>;
}
