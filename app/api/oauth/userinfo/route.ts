import { db } from "@/src/prisma/db";
import { hashOpaqueToken, oauthError } from "@/src/lib/oauth/protocol";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { getIssuer } from "@/src/lib/oauth/oidc";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return oauthError("invalid_token", 401);
  const token = authorization.slice(7).trim();
  if (!token || token.length > 512) return oauthError("invalid_token", 401);
  try {
    if (!(await allowOAuthRequest(request, "userinfo", 120, 60))) return oauthError("temporarily_unavailable", 429);
  } catch {
    return oauthError("temporarily_unavailable", 503, "Rate limiting is temporarily unavailable.");
  }

  const rows = await db.runtime().query(db.raw.sql`
    SELECT t.user_id AS "userId", array_to_string(t.scopes, ' ') AS scopes,
      t.resource, t.expires_at AS "expiresAt", u.status, u.deleted_at AS "userDeleted",
      c.is_active AS "clientActive", c.deleted_at AS "clientDeleted",
      o.status AS "orgStatus", o.deleted_at AS "orgDeleted",
      ea.normalized_email AS email, ea.verified_at AS "verifiedAt",
      p.username, p.display_name AS "displayName", p.avatar_url AS "avatarUrl"
    FROM public.access_tokens t
    JOIN public.users u ON u.id = t.user_id
    JOIN public.oauth_clients c ON c.id = t.oauth_client_id
    LEFT JOIN public.organizations o ON o.id = c.organization_id
    LEFT JOIN public.email_addresses ea ON ea.user_id = u.id AND ea.is_primary = true
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE t.token_hash = ${hashOpaqueToken(token)} AND t.revoked_at IS NULL LIMIT 1
  `.returnsRow({
    userId:"pg/uuid@1",scopes:"pg/text@1",resource:"pg/text@1",expiresAt:"pg/timestamptz-string@1",
    status:"pg/text@1",userDeleted:"pg/timestamptz-string@1",clientActive:"pg/bool@1",
    clientDeleted:"pg/timestamptz-string@1",orgStatus:"pg/text@1",orgDeleted:"pg/timestamptz-string@1",
    email:"pg/text@1",verifiedAt:"pg/timestamptz-string@1",username:"pg/text@1",
    displayName:"pg/text@1",avatarUrl:"pg/text@1"
  }).build());
  const row = rows[0];
  if (!row || row.status !== "ACTIVE" || row.userDeleted || !row.clientActive || row.clientDeleted ||
      (row.orgStatus && row.orgStatus !== "ACTIVE") || row.orgDeleted || new Date(row.expiresAt).getTime() <= Date.now()) {
    return oauthError("invalid_token", 401);
  }
  const scopes = typeof row.scopes === "string" ? row.scopes.split(" ").filter(Boolean) : [];
  let issuer: string;
  try { issuer = getIssuer(); } catch { return oauthError("server_configuration_error", 503); }
  if (row.resource !== issuer && row.resource !== issuer + "/api/oauth/userinfo" &&
      !(row.resource === issuer + "/api/v1" && scopes.includes("users:read"))) {
    return oauthError("invalid_token", 401, "The token was not issued for the UserInfo resource.");
  }
  if (!scopes.includes("openid") && !scopes.includes("users:read")) {
    return oauthError("insufficient_scope", 403, "The access token must include openid or users:read.");
  }

  const result: Record<string, unknown> = { sub: row.userId };
  if (scopes.includes("profile")) {
    if (row.username) result.preferred_username = row.username;
    if (row.displayName) result.name = row.displayName;
    if (row.avatarUrl) result.picture = row.avatarUrl;
  }
  if (scopes.includes("email")) {
    if (row.email) result.email = row.email;
    result.email_verified = Boolean(row.verifiedAt);
  }
  if (scopes.includes("users:read")) {
    if (row.email) result.email = row.email;
    result.email_verified = Boolean(row.verifiedAt);
    if (row.username) result.preferred_username = row.username;
    if (row.displayName) result.name = row.displayName;
    if (row.avatarUrl) result.picture = row.avatarUrl;
  }
  return Response.json(result, { headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}
