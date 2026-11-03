import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/src/prisma/db";

type ActiveAgentDomain = { id: string; hostname: string };

function getBaseDomain(): string {
  const value = (process.env.AGENT_GATEWAY_BASE_DOMAIN ?? "mcp.nishantapps.in").trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!value || value.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error("AGENT_GATEWAY_BASE_DOMAIN must be a valid DNS domain.");
  }
  return value;
}

function createHostname(username: string | null): string {
  const normalized = (username ?? "user").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 32) || "user";
  return `mcp-${normalized}${randomBytes(4).toString("hex")}.${getBaseDomain()}`;
}

/** Allocate a stable per-user hostname in OneAuth's PostgreSQL registry.
 * DNS is deliberately managed outside OneAuth; the wildcard record must route
 * this base domain to the configured public gateway.
 */
export async function ensureAgentDomain(userId: string, username: string | null): Promise<ActiveAgentDomain> {

  const existing = await db.runtime().query(db.raw.sql`
    SELECT id, hostname
    FROM public.agent_domains
    WHERE user_id=${userId}::uuid AND status='ACTIVE'
    LIMIT 1
  `.returnsRow({ id: "pg/uuid@1", hostname: "pg/text@1" }).build());

  if (existing.length) return existing[0] as ActiveAgentDomain;

  const inserted = await db.runtime().query(db.raw.sql`
    INSERT INTO public.agent_domains (id,user_id,hostname,status,created_at,last_used_at,updated_at)
    VALUES (${randomUUID()}::uuid,${userId}::uuid,${createHostname(username)},'ACTIVE',now(),now(),now())
    ON CONFLICT (user_id) WHERE status='ACTIVE' DO NOTHING
    RETURNING id, hostname
  `.returnsRow({ id: "pg/uuid@1", hostname: "pg/text@1" }).build());
  if (inserted.length) return inserted[0] as ActiveAgentDomain;

  const winner = await db.runtime().query(db.raw.sql`
    SELECT id, hostname
    FROM public.agent_domains
    WHERE user_id=${userId}::uuid AND status='ACTIVE'
    LIMIT 1
  `.returnsRow({ id: "pg/uuid@1", hostname: "pg/text@1" }).build());
  if (!winner.length) throw new Error("Agent domain allocation raced without an active winner.");
  return winner[0] as ActiveAgentDomain;
}
