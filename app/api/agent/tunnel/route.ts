import { db } from "@/src/prisma/db";
import { hashOpaqueToken, oauthError } from "@/src/lib/oauth/protocol";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { getIssuer } from "@/src/lib/oauth/oidc";
import { ensureAgentDomain } from "@/src/lib/agent-domains/provision";

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
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  try {
    const row = await ensureAgentDomain(auth.userId, null);
    await db.runtime().query(db.raw.sql`UPDATE public.agent_domains SET last_used_at=now(), updated_at=now() WHERE id=${row.id}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    return response({ url: `https://${row.hostname}`, hostname: row.hostname, status: "ACTIVE", gateway: "shared", transport: "websocket" });
  } catch {
    return oauthError("temporarily_unavailable", 503, "Unable to register the Agent URL. Check the Agent domain registry and AGENT_GATEWAY_BASE_DOMAIN configuration.");
  }
}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  try {
    const rows = await db.runtime().query(db.raw.sql`
      UPDATE public.agent_domains SET last_used_at=now(), updated_at=now()
      WHERE user_id=${auth.userId}::uuid AND status='ACTIVE'
      RETURNING hostname, status
    `.returnsRow({hostname:"pg/text@1",status:"pg/text@1"}).build());
    if (!rows.length) return oauthError("not_found", 404, "No active Agent URL exists. POST to create one.");
    return response({ url: `https://${rows[0].hostname}`, hostname: rows[0].hostname, status: rows[0].status, gateway: "shared", transport: "websocket" });
  } catch { return oauthError("temporarily_unavailable", 503); }
}
