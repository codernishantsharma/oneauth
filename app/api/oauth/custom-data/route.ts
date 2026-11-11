import { randomUUID } from "node:crypto";
import { db } from "@/src/prisma/db";
import { hashOpaqueToken, oauthError } from "@/src/lib/oauth/protocol";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { getIssuer } from "@/src/lib/oauth/oidc";
import { isCustomDataReadScope } from "@/src/lib/oauth/validation";

export const runtime = "nodejs";
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_JSON_BYTES = 16 * 1024;

type TokenRow = {
  userId: string; clientDbId: string; clientId: string; scopes: string; resource: string;
  expiresAt: string; status: string; userDeleted: string | null; clientActive: boolean;
  clientDeleted: string | null; orgStatus: string | null; orgDeleted: string | null;
};

async function authenticate(request: Request): Promise<{ token: TokenRow; scopes: string[] } | Response> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return oauthError("invalid_token", 401);
  const rawToken = authorization.slice(7).trim();
  if (!rawToken || rawToken.length > 512) return oauthError("invalid_token", 401);
  try {
    if (!(await allowOAuthRequest(request, "custom-data", 120, 60))) return oauthError("temporarily_unavailable", 429);
  } catch {
    return oauthError("temporarily_unavailable", 503, "Rate limiting is temporarily unavailable.");
  }
  const rows = await db.runtime().query(db.raw.sql`
    SELECT t.user_id AS "userId", c.id AS "clientDbId", c.client_id AS "clientId",
      array_to_string(t.scopes, ' ') AS scopes, t.resource, t.expires_at AS "expiresAt",
      u.status, u.deleted_at AS "userDeleted", c.is_active AS "clientActive",
      c.deleted_at AS "clientDeleted", o.status AS "orgStatus", o.deleted_at AS "orgDeleted"
    FROM public.access_tokens t
    JOIN public.users u ON u.id=t.user_id
    JOIN public.oauth_clients c ON c.id=t.oauth_client_id
    LEFT JOIN public.organizations o ON o.id=c.organization_id
    WHERE t.token_hash=${hashOpaqueToken(rawToken)} AND t.revoked_at IS NULL LIMIT 1
  `.returnsRow({
    userId:"pg/uuid@1",clientDbId:"pg/uuid@1",clientId:"pg/text@1",scopes:"pg/text@1",
    resource:"pg/text@1",expiresAt:"pg/timestamptz-string@1",status:"pg/text@1",
    userDeleted:"pg/timestamptz-string@1",clientActive:"pg/bool@1",clientDeleted:"pg/timestamptz-string@1",
    orgStatus:"pg/text@1",orgDeleted:"pg/timestamptz-string@1"
  }).build());
  const token = rows[0] as TokenRow | undefined;
  if (!token || token.status !== "ACTIVE" || token.userDeleted || !token.clientActive || token.clientDeleted ||
      (token.orgStatus && token.orgStatus !== "ACTIVE") || token.orgDeleted ||
      new Date(token.expiresAt).getTime() <= Date.now()) return oauthError("invalid_token", 401);
  let issuer: string;
  try { issuer = getIssuer(); } catch { return oauthError("server_configuration_error", 503); }
  if (token.resource !== issuer && token.resource !== issuer + "/api/oauth/custom-data" &&
      !(token.resource === issuer + "/api/v1" && (token.scopes.includes("custom_data:read") || token.scopes.includes("custom_data:write")))) {
    return oauthError("invalid_token", 401, "The token was not issued for the custom-data resource.");
  }
  return { token, scopes: token.scopes ? token.scopes.split(" ").filter(Boolean) : [] };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const ownerClientId = url.searchParams.get("owner_client_id") ?? auth.token.clientId;
  const field = url.searchParams.get("field") ?? "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(ownerClientId) || !KEY_PATTERN.test(field)) {
    return oauthError("invalid_request", 400, "Provide a valid owner_client_id and one field key.");
  }
  const isOwner = ownerClientId === auth.token.clientId;
  const fieldScope = `custom_data:read:${ownerClientId}:${field}`;
  if (isOwner) {
    if (!auth.scopes.includes("custom_data:read") && !auth.scopes.includes("custom_data:write")) {
      return oauthError("insufficient_scope", 403, "The token needs custom_data:read or custom_data:write.");
    }
  } else if (!auth.scopes.includes(fieldScope)) {
    return oauthError("insufficient_scope", 403, "This exact field has not been granted to this application.");
  }

  const owner = await db.runtime().query(db.raw.sql`
    SELECT id FROM public.oauth_clients WHERE client_id=${ownerClientId}
      AND is_active=true AND deleted_at IS NULL LIMIT 1
  `.returnsRow({id:"pg/uuid@1"}).build());
  if (!owner.length) return oauthError("invalid_request", 404, "The data-owning application was not found.");
  const rows = await db.runtime().query(db.raw.sql`
    SELECT custom_data -> ${owner[0].id}::text -> ${field} AS value
    FROM public.profiles WHERE user_id=${auth.token.userId}::uuid LIMIT 1
  `.returnsRow({value:"pg/jsonb@1"}).build());
  const value = rows[0]?.value;
  if (value === undefined || value === null) return oauthError("not_found", 404, "That custom-data field does not exist.");
  return Response.json({ owner_client_id: ownerClientId, field, value }, { headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}

export async function PUT(request: Request) {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;
  if (!auth.scopes.includes("custom_data:write")) return oauthError("insufficient_scope", 403, "The token needs custom_data:write.");
  let body: unknown;
  try { body = await request.json(); } catch { return oauthError("invalid_request", 400, "Expected a JSON object."); }
  if (!isJsonObject(body) || !isJsonObject(body.data) || Object.keys(body).some((key) => key !== "data")) {
    return oauthError("invalid_request", 400, "Send a JSON object shaped like { data: { field: value } }.");
  }
  const entries = Object.entries(body.data);
  if (!entries.length || entries.length > 50 || entries.some(([key]) => !KEY_PATTERN.test(key))) {
    return oauthError("invalid_request", 400, "Provide 1–50 valid top-level field names.");
  }
  const serialized = JSON.stringify(body.data);
  if (Buffer.byteLength(serialized, "utf8") > MAX_JSON_BYTES) return oauthError("invalid_request", 413, "Custom data must be 16 KB or smaller.");
  const ownerData = JSON.stringify(body.data);
  await db.runtime().query(db.raw.sql`
    INSERT INTO public.profiles (id, user_id, custom_data)
    VALUES (${randomUUID()}::uuid, ${auth.token.userId}::uuid,
      jsonb_build_object(${auth.token.clientDbId}, ${ownerData}::jsonb))
    ON CONFLICT (user_id) DO UPDATE SET
      custom_data = jsonb_set(
        COALESCE(public.profiles.custom_data, '{}'::jsonb),
        ARRAY[${auth.token.clientDbId}],
        COALESCE(public.profiles.custom_data -> ${auth.token.clientDbId}, '{}'::jsonb) || ${ownerData}::jsonb,
        true
      ),
      updated_at = now()
    RETURNING user_id
  `.returnsRow({user_id:"pg/uuid@1"}).build());
  return Response.json({ success: true, fields: entries.map(([key]) => key) }, { headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}
