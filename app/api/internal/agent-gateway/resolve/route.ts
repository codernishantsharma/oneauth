import { timingSafeEqual } from "node:crypto";
import { db } from "@/src/prisma/db";
import { SHARED_AGENT_TUNNEL_ID } from "@/src/lib/tunnels/cloudflare";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function authorized(request: Request): boolean {
  const expected = process.env.AGENT_GATEWAY_SHARED_SECRET ?? "";
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Private registry lookup for the shared gateway/broker.
 * This intentionally returns identity metadata, not a localTarget URL: the
 * Agent runs on a user's machine, so 127.0.0.1 from OneAuth is not that machine.
 */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
  }
  const rawHostname = typeof body === "object" && body !== null && "hostname" in body
    ? (body as { hostname?: unknown }).hostname : undefined;
  if (typeof rawHostname !== "string" || rawHostname.length > 253) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE });
  }

  const hostname = rawHostname.trim().toLowerCase().replace(/\.$/, "");
  const domain = (process.env.CLOUDFLARE_TUNNEL_DOMAIN ?? "nishantapps.in").trim().toLowerCase();
  const managedPrefix = hostname.endsWith("." + domain)
    ? hostname.slice(0, -(domain.length + 1))
    : "";
  // Accept exactly one generated mcp-* label under the configured domain.
  if (!/^mcp-[a-z0-9-]+$/.test(managedPrefix)) {
    return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }

  try {
    const rows = await db.runtime().query(db.raw.sql`
      SELECT id, user_id AS "userId", hostname, status
      FROM public.agent_tunnels
      WHERE hostname=${hostname}
        AND tunnel_id=${SHARED_AGENT_TUNNEL_ID}
        AND status='ACTIVE'
        AND deleted_at IS NULL
      LIMIT 1
    `.returnsRow({ id: "pg/uuid@1", userId: "pg/uuid@1", hostname: "pg/text@1", status: "pg/text@1" }).build());

    if (!rows.length) return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
    const row = rows[0] as { id: string; userId: string; hostname: string; status: string };
    return Response.json({
      agentId: row.id,
      userId: row.userId,
      hostname: row.hostname,
      status: row.status,
    }, { headers: NO_STORE });
  } catch {
    return Response.json({ error: "temporarily_unavailable" }, { status: 503, headers: NO_STORE });
  }
}
