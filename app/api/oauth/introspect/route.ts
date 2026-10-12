import { createHash } from "node:crypto";
import { db } from "@/src/prisma/db";
import { findClient, hashOpaqueToken, oauthError, safeEqual } from "@/src/lib/oauth/protocol";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { isFormUrlEncodedContentType } from "@/src/lib/oauth/validation";
import { getIssuer } from "@/src/lib/oauth/oidc";

export const runtime = "nodejs";

async function authenticateClient(request: Request, form: FormData) {
  const header = request.headers.get("authorization");
  let clientId = String(form.get("client_id") ?? "");
  let secret = String(form.get("client_secret") ?? "");
  let method: "basic" | "post" | "none" = secret ? "post" : "none";
  if (header) {
    if (!header.startsWith("Basic ") || secret) return null;
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator < 1) return null;
      const basicId = decodeURIComponent(decoded.slice(0, separator));
      if (clientId && clientId !== basicId) return null;
      clientId = basicId;
      secret = decodeURIComponent(decoded.slice(separator + 1));
      method = "basic";
    } catch { return null; }
  }
  if (!clientId) return null;
  const client = await findClient(clientId);
  if (!client) return null;
  if (client.authMethod === "NONE") return method === "none" ? client : null;
  if ((client.authMethod === "CLIENT_SECRET_BASIC" && method !== "basic") ||
      (client.authMethod === "CLIENT_SECRET_POST" && method !== "post") ||
      !client.secretHash || !secret) return null;
  return safeEqual(createHash("sha256").update(secret).digest("hex"), client.secretHash) ? client : null;
}

export async function POST(request: Request) {
  try {
    if (!isFormUrlEncodedContentType(request.headers.get("content-type"))) {
      return oauthError("invalid_request", 400, "Use application/x-www-form-urlencoded.");
    }
    try {
      if (!(await allowOAuthRequest(request, "introspect-preauth", 120, 60))) return oauthError("temporarily_unavailable", 429);
    } catch { return oauthError("temporarily_unavailable", 503); }

    const form = await request.formData();
    const client = await authenticateClient(request, form);
    if (!client) return oauthError("invalid_client", 401);
    try {
      if (!(await allowOAuthRequest(request, `introspect:${client.clientId}`, 120, 60))) return oauthError("temporarily_unavailable", 429);
    } catch { return oauthError("temporarily_unavailable", 503); }

    const token = String(form.get("token") ?? "");
    const hint = String(form.get("token_type_hint") ?? "");
    if (!token || token.length > 512) return oauthError("invalid_request", 400, "A token is required.");
    if (hint && hint !== "access_token" && hint !== "refresh_token") return oauthError("invalid_request", 400, "Unsupported token_type_hint.");

    const hash = hashOpaqueToken(token);
    const inactive = Response.json({ active: false }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
    if (hint !== "refresh_token") {
      const rows = await db.runtime().query(db.raw.sql`SELECT t.user_id AS "userId",array_to_string(t.scopes,' ') AS scopes,t.resource,t.issued_at AS "issuedAt",t.expires_at AS "expiresAt",t.revoked_at AS "revokedAt",u.status AS "userStatus",u.deleted_at AS "userDeleted",c.is_active AS "clientActive",c.deleted_at AS "clientDeleted",c.environment,o.status AS "orgStatus",o.deleted_at AS "orgDeleted" FROM public.access_tokens t JOIN public.users u ON u.id=t.user_id JOIN public.oauth_clients c ON c.id=t.oauth_client_id LEFT JOIN public.organizations o ON o.id=c.organization_id WHERE t.token_hash=${hash} AND t.oauth_client_id=${client.id}::uuid LIMIT 1`.returnsRow({userId:"pg/uuid@1",scopes:"pg/text@1",resource:"pg/text@1",issuedAt:"pg/timestamptz-string@1",expiresAt:"pg/timestamptz-string@1",revokedAt:"pg/timestamptz-string@1",userStatus:"pg/text@1",userDeleted:"pg/timestamptz-string@1",clientActive:"pg/bool@1",clientDeleted:"pg/timestamptz-string@1",environment:"pg/text@1",orgStatus:"pg/text@1",orgDeleted:"pg/timestamptz-string@1"}).build());
      const row = rows[0];
      if (row && !row.revokedAt && row.userStatus === "ACTIVE" && !row.userDeleted && row.clientActive && !row.clientDeleted && (!row.orgStatus || row.orgStatus === "ACTIVE") && !row.orgDeleted && new Date(row.expiresAt).getTime() > Date.now()) {
        const scopes = typeof row.scopes === "string" ? row.scopes.split(" ").filter(Boolean) : [];
        return Response.json({ active: true, client_id: client.clientId, sub: row.userId, scope: scopes.join(" "), aud: row.resource, iss: getIssuer(), iat: Math.floor(new Date(row.issuedAt).getTime() / 1000), exp: Math.floor(new Date(row.expiresAt).getTime() / 1000), token_type: "Bearer" }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
      }
      if (hint === "access_token") return inactive;
    }

    if (hint !== "access_token") {
      const rows = await db.runtime().query(db.raw.sql`SELECT t.user_id AS "userId",array_to_string(t.scopes,' ') AS scopes,t.resource,t.issued_at AS "issuedAt",t.expires_at AS "expiresAt",t.revoked_at AS "revokedAt",u.status AS "userStatus",u.deleted_at AS "userDeleted",c.is_active AS "clientActive",c.deleted_at AS "clientDeleted",c.environment,o.status AS "orgStatus",o.deleted_at AS "orgDeleted" FROM public.refresh_tokens t LEFT JOIN public.users u ON u.id=t.user_id JOIN public.oauth_clients c ON c.id=t.oauth_client_id LEFT JOIN public.organizations o ON o.id=c.organization_id WHERE t.token_hash=${hash} AND t.oauth_client_id=${client.id}::uuid LIMIT 1`.returnsRow({userId:"pg/uuid@1",scopes:"pg/text@1",resource:"pg/text@1",issuedAt:"pg/timestamptz-string@1",expiresAt:"pg/timestamptz-string@1",revokedAt:"pg/timestamptz-string@1",userStatus:"pg/text@1",userDeleted:"pg/timestamptz-string@1",clientActive:"pg/bool@1",clientDeleted:"pg/timestamptz-string@1",environment:"pg/text@1",orgStatus:"pg/text@1",orgDeleted:"pg/timestamptz-string@1"}).build());
      const row = rows[0];
      if (row && !row.revokedAt && row.userStatus === "ACTIVE" && !row.userDeleted && row.clientActive && !row.clientDeleted && (!row.orgStatus || row.orgStatus === "ACTIVE") && !row.orgDeleted && new Date(row.expiresAt).getTime() > Date.now()) {
        const scopes = typeof row.scopes === "string" ? row.scopes.split(" ").filter(Boolean) : [];
        return Response.json({ active: true, client_id: client.clientId, sub: row.userId, scope: scopes.join(" "), aud: row.resource, iss: getIssuer(), iat: Math.floor(new Date(row.issuedAt).getTime() / 1000), exp: Math.floor(new Date(row.expiresAt).getTime() / 1000), token_type: "Bearer" }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
      }
    }
    return inactive;
  } catch {
    return oauthError("server_error", 500);
  }
}
