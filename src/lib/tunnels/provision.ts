import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/src/prisma/db";
import { configureSharedAgentGateway, SHARED_AGENT_TUNNEL_ID, tunnelHostname } from "@/src/lib/tunnels/cloudflare";

type ActiveTunnel = { id: string; tunnelId: string; hostname: string; localPort: number };

/**
 * Registers a per-user hostname behind the shared Cloudflare gateway.
 * Cloudflare tunnel credentials stay on the gateway host and are never handed
 * to individual Agent clients.
 */
export async function ensureAgentTunnel(userId: string, username: string | null, localPort = 43127): Promise<ActiveTunnel> {
  if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) throw new Error("Invalid Agent local port.");
  await configureSharedAgentGateway();

  const existing = await db.runtime().query(db.raw.sql`
    SELECT id, tunnel_id AS "tunnelId", hostname, local_port AS "localPort" FROM public.agent_tunnels
    WHERE user_id=${userId}::uuid AND status='ACTIVE' LIMIT 1
  `.returnsRow({ id: "pg/uuid@1", tunnelId: "pg/text@1", hostname: "pg/text@1", localPort: "pg/int4@1" }).build());
  if (existing.length) {
    const current = existing[0] as ActiveTunnel;
    const updated = await db.runtime().query(db.raw.sql`UPDATE public.agent_tunnels SET local_port=${localPort}, updated_at=now() WHERE id=${current.id}::uuid RETURNING id, tunnel_id AS "tunnelId", hostname, local_port AS "localPort"`.returnsRow({ id: "pg/uuid@1", tunnelId: "pg/text@1", hostname: "pg/text@1", localPort: "pg/int4@1" }).build());
    return updated[0] as ActiveTunnel;
  }

  const hostname = tunnelHostname(username ?? "user");
  const rowId = randomUUID();
  const inserted = await db.runtime().query(db.raw.sql`
    INSERT INTO public.agent_tunnels (id,user_id,tunnel_id,hostname,local_port,status,created_at,last_used_at,updated_at)
    VALUES (${rowId}::uuid,${userId}::uuid,${SHARED_AGENT_TUNNEL_ID},${hostname},${localPort},'ACTIVE',now(),now(),now())
    ON CONFLICT (user_id) WHERE status='ACTIVE' DO NOTHING
    RETURNING id, tunnel_id AS "tunnelId", hostname, local_port AS "localPort"
  `.returnsRow({ id: "pg/uuid@1", tunnelId: "pg/text@1", hostname: "pg/text@1", localPort: "pg/int4@1" }).build());
  if (inserted.length) return inserted[0] as ActiveTunnel;

  const winner = await db.runtime().query(db.raw.sql`
    SELECT id, tunnel_id AS "tunnelId", hostname, local_port AS "localPort" FROM public.agent_tunnels
    WHERE user_id=${userId}::uuid AND status='ACTIVE' LIMIT 1
  `.returnsRow({ id: "pg/uuid@1", tunnelId: "pg/text@1", hostname: "pg/text@1", localPort: "pg/int4@1" }).build());
  if (!winner.length) throw new Error("Shared gateway hostname provisioning raced without an active winner.");
  return winner[0] as ActiveTunnel;
}
