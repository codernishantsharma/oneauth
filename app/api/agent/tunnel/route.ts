import { db } from "@/src/prisma/db";
import { randomInt } from "node:crypto";
import { hashOpaqueToken, oauthError } from "@/src/lib/oauth/protocol";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { getIssuer } from "@/src/lib/oauth/oidc";
import { ensureAgentTunnel } from "@/src/lib/tunnels/provision";

export const runtime = "nodejs";
const AGENT_CLIENT_ID = "oa_lRsROH_4M6nZhGtuiX9Ulwe7Ei3Tp589";
type AuthRow = { userId: string; clientId: string; scopes: string; resource: string; expiresAt: string; status: string; userDeleted: string | null; clientActive: boolean; clientDeleted: string | null; orgStatus: string | null; orgDeleted: string | null };
async function authenticate(request: Request): Promise<{ userId: string } | Response> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return oauthError("invalid_token", 401);
  const raw = header.slice(7).trim();
  if (!raw || raw.length > 512) return oauthError("invalid_token", 401);
  try { if (!(await allowOAuthRequest(request, "agent-tunnel", 30, 60))) return oauthError("temporarily_unavailable", 429); }
  catch { return oauthError("temporarily_unavailable", 503); }
  const rows = await db.runtime().query(db.raw.sql`
    SELECT t.user_id AS "userId", c.client_id AS "clientId", array_to_string(t.scopes, ' ') AS scopes,
      t.resource, t.expires_at AS "expiresAt", u.status, u.deleted_at AS "userDeleted",
      c.is_active AS "clientActive", c.deleted_at AS "clientDeleted", o.status AS "orgStatus", o.deleted_at AS "orgDeleted"
    FROM public.access_tokens t JOIN public.users u ON u.id=t.user_id
    JOIN public.oauth_clients c ON c.id=t.oauth_client_id LEFT JOIN public.organizations o ON o.id=c.organization_id
    WHERE t.token_hash=${hashOpaqueToken(raw)} AND t.revoked_at IS NULL LIMIT 1
  `.returnsRow({ userId:"pg/uuid@1", clientId:"pg/text@1", scopes:"pg/text@1", resource:"pg/text@1", expiresAt:"pg/timestamptz-string@1", status:"pg/text@1", userDeleted:"pg/timestamptz-string@1", clientActive:"pg/bool@1", clientDeleted:"pg/timestamptz-string@1", orgStatus:"pg/text@1", orgDeleted:"pg/timestamptz-string@1" }).build());
  const row = rows[0] as AuthRow | undefined;
  if (!row || row.clientId !== AGENT_CLIENT_ID || row.status !== "ACTIVE" || row.userDeleted || !row.clientActive || row.clientDeleted || (row.orgStatus && row.orgStatus !== "ACTIVE") || row.orgDeleted || new Date(row.expiresAt).getTime() <= Date.now()) return oauthError("invalid_token", 401);
  if (!row.scopes.split(" ").includes("tunnel:manage")) return oauthError("insufficient_scope", 403, "The token needs tunnel:manage.");
  let issuer: string;
  try { issuer = getIssuer(); } catch { return oauthError("server_configuration_error", 503); }
  if (row.resource !== issuer && row.resource !== issuer + "/api/agent/tunnel") return oauthError("invalid_token", 401, "The token was not issued for the Agent tunnel resource.");
  return { userId: row.userId };
}
// The Agent's local HTTP listener should bind to this port. Override it per
// deployment with AGENT_LOCAL_PORT if the extension's listener uses another port.
function localTarget(port: number): string {
  return `http://127.0.0.1:${port}`;
}

/**
 * Pick from the unprivileged range, excluding common development and service
 * ports. The extension must still bind() and retry if the OS reports a conflict.
 */
const COMMONLY_USED_PORTS = new Set([
  1433, 1521, 2049, 2181, 2375, 2376, 2483, 2484, 3000, 3001, 3002, 3306,
  3389, 4000, 4200, 4222, 4243, 4369, 4444, 4500, 4567, 5000, 5001, 5002,
  5050, 5060, 5061, 5173, 5432, 5672, 5900, 5984, 6000, 6379, 6443, 6667,
  7000, 7001, 7474, 7687, 8000, 8001, 8008, 8080, 8081, 8082, 8086, 8088,
  8090, 8123, 8161, 8200, 8443, 8500, 8761, 8888, 9000, 9001, 9042, 9090,
  9092, 9100, 9200, 9300, 9418, 9999, 10000, 11211, 15672, 27017, 28017,
]);

async function allocateAgentPort(): Promise<number> {
  const minPort = 1024;
  const maxPort = 65535;
  for (let attempt = 0; attempt < 500; attempt++) {
    const candidate = randomInt(minPort, maxPort + 1);
    if (COMMONLY_USED_PORTS.has(candidate)) continue;
    const used = await db.runtime().query(db.raw.sql`
      SELECT id FROM public.agent_tunnels
      WHERE status='ACTIVE' AND local_port=${candidate}
      LIMIT 1
    `.returnsRow({ id: "pg/uuid@1" }).build());
    if (!used.length) return candidate;
  }
  throw new Error("Unable to allocate an unassigned, non-common Agent port.");
}

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  try {
    let payload: unknown;
    try { payload = await request.json(); } catch { payload = null; }
    const requestedPort = typeof payload === "object" && payload !== null && "port" in payload ? (payload as { port?: unknown }).port : undefined;
    if (requestedPort !== undefined && (!Number.isInteger(requestedPort) || Number(requestedPort) < 1 || Number(requestedPort) > 65535)) {
      return oauthError("invalid_request", 400, "The port field must be an integer between 1 and 65535.");
    }
    // No port supplied: assign an unused candidate for the extension to bind.
    // If the OS reports EADDRINUSE, the extension can retry with another port.
    const port = requestedPort === undefined ? await allocateAgentPort() : Number(requestedPort);
    const row = await ensureAgentTunnel(auth.userId, null, port);
    await db.runtime().query(db.raw.sql`UPDATE public.agent_tunnels SET last_used_at=now(), updated_at=now() WHERE id=${row.id}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    // The shared tunnel token belongs only on the gateway host. Never expose it
    // to a per-user extension, which would allow one client to impersonate the gateway.
    return response({ url: `https://${row.hostname}`, hostname: row.hostname, port: row.localPort, localTarget: localTarget(row.localPort), status: "ACTIVE", gateway: "shared" });
  } catch {
    return oauthError("temporarily_unavailable", 503, "Unable to register the Agent URL. Check OneAuth Cloudflare configuration.");
  }
}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  try {
    const rows = await db.runtime().query(db.raw.sql`
      UPDATE public.agent_tunnels SET last_used_at=now(), updated_at=now()
      WHERE user_id=${auth.userId}::uuid AND status='ACTIVE'
      RETURNING hostname, status, local_port AS "localPort"
    `.returnsRow({hostname:"pg/text@1",status:"pg/text@1",localPort:"pg/int4@1"}).build());
    if (!rows.length) return oauthError("not_found", 404, "No active Agent URL exists. POST to create one.");
    return response({ url: `https://${rows[0].hostname}`, hostname: rows[0].hostname, port: rows[0].localPort, localTarget: localTarget(rows[0].localPort), status: rows[0].status, gateway: "shared" });
  } catch { return oauthError("temporarily_unavailable", 503); }
}
