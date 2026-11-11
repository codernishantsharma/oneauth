import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/src/prisma/db";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { allowsHttpLoopbackRedirect } from "@/src/lib/oauth/validation";

export const runtime = "nodejs";
const allowedScopes = new Set(["mcp:connect", "openid", "profile", "email", "offline_access"]);

function dcrError(error: string, status = 400, description?: string) {
  return Response.json({ error, ...(description ? { error_description: description } : {}) }, {
    status, headers: { "Cache-Control": "no-store", Pragma: "no-cache", "Content-Type": "application/json; charset=utf-8" },
  });
}

function validRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === "https:") return true;
    return allowsHttpLoopbackRedirect("PRODUCTION", "NATIVE") &&
      url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

export async function POST(request: Request) {
  try {
    if (!(await allowOAuthRequest(request, "client-registration", 20, 60)))
      return dcrError("rate_limit_exceeded", 429, "Too many client registrations. Retry later.");
  } catch { return dcrError("server_error", 503, "Client registration is temporarily unavailable."); }

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return dcrError("invalid_request", 415, "Send a JSON registration request.");

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16_384) return dcrError("invalid_client_metadata", 413, "Registration metadata is too large.");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return dcrError("invalid_client_metadata");
    body = parsed as Record<string, unknown>;
  } catch { return dcrError("invalid_client_metadata", 400, "Registration metadata must be valid JSON."); }

  const name = typeof body.client_name === "string" ? body.client_name.trim() : "";
  const redirects = body.redirect_uris;
  if (!name || name.length > 100) return dcrError("invalid_client_metadata", 400, "client_name is required and must be at most 100 characters.");
  if (!Array.isArray(redirects) || redirects.length < 1 || redirects.length > 20 ||
      redirects.some(uri => !validRedirectUri(uri)) || new Set(redirects).size !== redirects.length)
    return dcrError("invalid_redirect_uri", 400, "Provide 1–20 unique HTTPS or loopback redirect URIs.");

  const grantTypes = body.grant_types === undefined ? ["authorization_code"] : body.grant_types;
  const responseTypes = body.response_types === undefined ? ["code"] : body.response_types;
  if (!Array.isArray(grantTypes) || !grantTypes.includes("authorization_code") ||
      grantTypes.some(value => value !== "authorization_code" && value !== "refresh_token") ||
      new Set(grantTypes).size !== grantTypes.length ||
      !Array.isArray(responseTypes) || responseTypes.length !== 1 || responseTypes[0] !== "code")
    return dcrError("invalid_client_metadata", 400, "Only Authorization Code and optional Refresh Token grants are supported.");
  if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none")
    return dcrError("invalid_client_metadata", 400, "Public clients must use token_endpoint_auth_method=none.");
  if (body.application_type !== undefined && !["native", "web"].includes(String(body.application_type)))
    return dcrError("invalid_client_metadata", 400, "Unsupported application_type.");
  if (body.software_statement !== undefined || body.jwks !== undefined || body.jwks_uri !== undefined ||
      body.client_secret !== undefined || body.client_secret_expires_at !== undefined)
    return dcrError("invalid_client_metadata", 400, "Client-supplied secrets and unverified key metadata are not accepted.");

  // ChatGPT's DCR request may omit `scope`; register the identity and refresh
  // permissions it subsequently requests, alongside the MCP resource scope.
  const requiredMcpScopes = ["mcp:connect", "openid", "email", "offline_access"];
  const requestedScopes = [...new Set([
    ...(typeof body.scope === "string" ? body.scope.trim().split(/\s+/).filter(Boolean) : []),
    ...requiredMcpScopes,
  ])];
  if (!requestedScopes.length || requestedScopes.length > allowedScopes.size || requestedScopes.some(scope => !allowedScopes.has(scope)))
    return dcrError("invalid_client_metadata", 400, "One or more requested scopes are not available for dynamic MCP clients.");
  if (!requestedScopes.includes("mcp:connect"))
    return dcrError("invalid_client_metadata", 400, "Dynamic MCP clients must request the mcp:connect scope.");

  const registeredGrantTypes = [...grantTypes] as string[];
  if (requestedScopes.includes("offline_access") && !registeredGrantTypes.includes("refresh_token"))
    registeredGrantTypes.push("refresh_token");

  const id = randomUUID();
  const clientId = `oa_${randomBytes(24).toString("base64url")}`;
  const scopeList = requestedScopes.join(" ");
  const redirectList = (redirects as string[]).join("\n");
  const grantList = registeredGrantTypes.join(" ");

  try {
    await db.runtime().query(db.raw.sql`
      WITH requested_scopes AS MATERIALIZED (
        SELECT unnest(string_to_array(${scopeList}::text, ' ')) AS scope_name
      ), scope_catalog AS (
        INSERT INTO public.oauth_scopes (id,name,description,is_default,created_at)
        SELECT gen_random_uuid(), requested_scopes.scope_name,
          CASE requested_scopes.scope_name
            WHEN 'mcp:connect' THEN 'Connect to the OneAuth MCP server'
            WHEN 'openid' THEN 'OpenID Connect sign-in'
            WHEN 'profile' THEN 'Read basic profile information'
            WHEN 'email' THEN 'Read email address'
            WHEN 'offline_access' THEN 'Obtain refresh tokens'
          END, false, now()
        FROM requested_scopes
        ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name
        RETURNING name
      ), inserted AS (
        INSERT INTO public.oauth_clients
          (id,client_id,client_secret_hash,name,description,client_type,environment,
           token_endpoint_auth_method,grant_types,response_types,organization_id,owner_user_id,
           is_active,created_at,updated_at)
        VALUES
          (${id}::uuid,${clientId},NULL,${name},'Dynamically registered public MCP client',${body.application_type === "web" ? "SPA_PUBLIC" : "NATIVE"},'PRODUCTION',
           'NONE',string_to_array(${grantList}::text, ' '),ARRAY['code']::text[],NULL,NULL,true,now(),now())
        RETURNING id
      ), inserted_redirects AS (
        INSERT INTO public.oauth_redirect_uris (id,oauth_client_id,uri,created_at)
        SELECT gen_random_uuid(), inserted.id, u.uri, now()
        FROM inserted CROSS JOIN unnest(string_to_array(${redirectList}::text, chr(10))) AS u(uri)
        RETURNING id
      ), inserted_scopes AS (
        INSERT INTO public.oauth_client_scopes (id,oauth_client_id,scope_name,created_at)
        SELECT gen_random_uuid(), inserted.id, requested_scopes.scope_name, now()
        FROM inserted CROSS JOIN requested_scopes
        JOIN scope_catalog ON scope_catalog.name=requested_scopes.scope_name
        RETURNING id
      )
      SELECT inserted.id FROM inserted
      CROSS JOIN (SELECT count(*) FROM inserted_redirects) redirects
      CROSS JOIN (SELECT count(*) FROM inserted_scopes) scopes
    `.returnsRow({ id: "pg/uuid@1" }).build());
  } catch (error) {
    console.error("[oauth/register] Dynamic client registration failed", error instanceof Error ? error.message : "unknown");
    return dcrError("server_error", 500, "Client registration could not be completed.");
  }

  const issuer = process.env.ONEAUTH_ISSUER_URL?.trim().replace(/\/+$/, "") ?? new URL(request.url).origin;
  return Response.json({
    client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name,
    redirect_uris: redirects, grant_types: registeredGrantTypes, response_types: ["code"],
    token_endpoint_auth_method: "none", application_type: body.application_type === "web" ? "web" : "native",
    scope: scopeList,
  }, {
    status: 201,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache", Location: issuer + "/api/oauth/register" },
  });
}
