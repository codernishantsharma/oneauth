import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth/session";
import { db } from "@/src/prisma/db";
import { findClient, validRedirectUri, hashOpaqueToken, getClientScopes } from "@/src/lib/oauth/protocol";
import { allowOAuthRequest, rateLimitedResponse } from "@/src/lib/oauth/rate-limit";
import { getIssuer, getOidcKey } from "@/src/lib/oauth/oidc";
import { resolveOAuthResource } from "@/src/lib/oauth/resource";
import { ensureAgentTunnel } from "@/src/lib/tunnels/provision";

import { isValidOAuthState, isValidOidcNonce, isValidPkceChallenge, parseRequestedScopes, isCustomDataReadScope } from "@/src/lib/oauth/validation";

export const runtime = "nodejs";
const csrfCookie = "oneauth_oauth_csrf";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));

function apiError(message: string, status = 400) {
  return Response.json({ error: message }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}


export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const responseType = url.searchParams.get("response_type") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const challenge = url.searchParams.get("code_challenge") ?? "";
  const challengeMethod = url.searchParams.get("code_challenge_method") ?? "";
  const scopeString = url.searchParams.get("scope") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  const requestedResource = url.searchParams.get("resource") ?? "";
  if (!clientId || !redirectUri || responseType !== "code" || !isValidOAuthState(state) || !isValidPkceChallenge(challenge, challengeMethod) || !isValidOidcNonce(nonce)) {
    return apiError("Invalid authorization request. Authorization Code with PKCE (S256), a redirect URI, and state are required.", 400);
  }
  try { if (!(await allowOAuthRequest(request, "authorize-ip", 60, 60))) return apiError("Too many requests. Please retry later.", 429); } catch { return apiError("Authorization temporarily unavailable.", 503); }
  const client = await findClient(clientId);
  if (!client || !client.grantTypes.includes("authorization_code")) return apiError("Unknown or disabled application.", 400);
  if (!(await validRedirectUri(clientId, redirectUri))) return apiError("The redirect URI is not registered for this application.", 400);
  try { if (!(await allowOAuthRequest(request, `authorize:${clientId}`, 30, 60))) return apiError("Too many requests. Please retry later.", 429); } catch { return apiError("Rate limiting is temporarily unavailable. Please retry later.", 503); }
  const clientScopes = await getClientScopes(client.id);
  const requestedScopes = parseRequestedScopes(scopeString, clientScopes);
  if (!requestedScopes) return apiError("One or more requested permissions are unsupported or not registered for this application.", 400);
  let resource: string | null;
  try { resource = resolveOAuthResource(requestedResource, requestedScopes, getIssuer()); } catch { return apiError("Authorization server configuration error. Configure the canonical issuer URL and retry.", 503); }
  if (!resource) return apiError("This application requested an unsupported API audience for these scopes.", 400);
  if (requestedScopes.includes("openid")) {
    try { await getOidcKey(); } catch { return apiError("OpenID Connect is not configured. Contact the OneAuth administrator.", 503); }
  }

  const user = await getCurrentUser();
  if (!user) return apiError("Sign in to OneAuth in this browser, then restart the authorization flow.", 401);
  const csrf = randomBytes(32).toString("base64url");
  const hidden = { clientId, redirectUri, state, challenge, nonce, resource, scopes: requestedScopes.filter(scope => !isCustomDataReadScope(scope)).join(" ") };
  const scopeLabel = (scope: string) => { const match = /^custom_data:read:([A-Za-z0-9_-]+):([A-Za-z][A-Za-z0-9_.-]*)$/.exec(scope); return match ? `Read only the “${match[2]}” field from app ${match[1]}` : ({ openid: "Sign in with OneAuth", profile: "Read your basic profile, including profile picture", email: "Read your email address", "custom_data:read": "Read custom data (only fields explicitly requested)", "custom_data:write": "Create and update this app's private custom data" } as Record<string, string>)[scope] ?? scope; };
  const requestedFieldScopes = requestedScopes.filter(isCustomDataReadScope);
  const response = Response.json({
    client: { name: client.name, clientId: client.clientId },
    account: { email: user.email },
    permissions: requestedScopes.map(scope => ({ scope, label: scopeLabel(scope), optional: isCustomDataReadScope(scope) })),
    request: { clientId, redirectUri, state, challenge, nonce, resource, scopes: requestedScopes.filter(scope => !isCustomDataReadScope(scope)).join(" "), csrf },
  }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  response.headers.append("Set-Cookie", `${csrfCookie}=${csrf}; Path=/api/oauth/authorize; HttpOnly; SameSite=Strict; Max-Age=600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}

export async function POST(request: Request) {
  try {
    try { if (!(await allowOAuthRequest(request, "authorize-consent-ip", 60, 60))) return apiError("Too many requests.", 429); } catch { return apiError("Authorization temporarily unavailable.", 503); }
    const form = await request.formData();

    const get = (key: string) => String(form.get(key) ?? "");
    const clientId = get("clientId"), redirectUri = get("redirectUri"), state = get("state"), challenge = get("challenge"), nonce = get("nonce"), resource = get("resource"), csrf = get("csrf");
    const scopes = [...get("scopes").split(" ").filter(Boolean), ...form.getAll("field_scope").map(String)].filter(Boolean);
    const cookie = request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(csrfCookie + "="))?.slice(csrfCookie.length + 1);
    if (!csrf || !cookie || csrf !== cookie) return apiError("This authorization request expired. Restart the flow.", 403);
    const user = await getCurrentUser();
    if (!user) return apiError("Sign in and restart the authorization flow.", 401);
    const client = await findClient(clientId);
    if (!client || !client.grantTypes.includes("authorization_code") || !(await validRedirectUri(clientId, redirectUri))) return apiError("Invalid application request.", 400);
    if (!isValidOAuthState(state) || redirectUri.length > 2048 || !isValidOidcNonce(nonce) || !isValidPkceChallenge(challenge, "S256") || !scopes.length) return apiError("Invalid authorization request.", 400);
    const clientScopes = await getClientScopes(client.id);
    if (!parseRequestedScopes(scopes.join(" "), clientScopes)) return apiError("Application permission mismatch.", 400);
    let checkedResource: string | null;
    try { checkedResource = resolveOAuthResource(resource, scopes, getIssuer()); } catch { return apiError("Authorization server configuration error.", 503); }
    if (!checkedResource || checkedResource !== resource) return apiError("This application requested an unsupported API audience for these scopes.", 400);
    if (scopes.includes("openid")) {
      try { await getOidcKey(); } catch { return apiError("OpenID Connect is not configured.", 503); }
    }
    const redirect = new URL(redirectUri);
    if (get("decision") !== "approve") {
      redirect.searchParams.set("error", "access_denied"); redirect.searchParams.set("state", state); redirect.searchParams.set("iss", getIssuer());
      const response = NextResponse.json({ redirect: redirect.toString() }, { headers: { "Cache-Control": "no-store" } }); response.cookies.set(csrfCookie, "", { path: "/api/oauth/authorize", maxAge: 0 }); return response;
    }

    // The current database contract does not define a unique constraint on
    // (user_id, oauth_client_id), so ON CONFLICT on those columns fails at runtime.
    // Reuse the newest existing consent when present; otherwise create one.
    const existingConsents = await db.runtime().query(db.raw.sql`
    SELECT id FROM public.oauth_consents
    WHERE user_id=${user.id}::uuid AND oauth_client_id=${client.id}::uuid
    ORDER BY granted_at DESC, id DESC
    LIMIT 1
  `.returnsRow({ id: "pg/uuid@1" }).build());
    let activeConsentId: string | undefined = existingConsents[0]?.id;
    if (activeConsentId) {
      const updatedConsents = await db.runtime().query(db.raw.sql`
      UPDATE public.oauth_consents
      SET status='ACTIVE', revoked_at=NULL, granted_at=now(), expires_at=NULL
      WHERE id=${activeConsentId}::uuid
      RETURNING id
    `.returnsRow({ id: "pg/uuid@1" }).build());
      activeConsentId = updatedConsents[0]?.id;
    } else {
      const consentRows = await db.runtime().query(db.raw.sql`
      INSERT INTO public.oauth_consents (id,oauth_client_id,user_id,status,granted_at,revoked_at,expires_at)
      VALUES (${randomUUID()}::uuid,${client.id}::uuid,${user.id}::uuid,'ACTIVE',now(),NULL,NULL)
      RETURNING id
    `.returnsRow({ id: "pg/uuid@1" }).build());
      activeConsentId = consentRows[0]?.id;
    }
    if (!activeConsentId) return apiError("Could not save application access. Please restart authorization.", 503);
    // Re-consent replaces the previous scope grant instead of silently keeping
    // permissions the user may have removed during an earlier authorization.
    await db.runtime().query(db.raw.sql`DELETE FROM public.oauth_consent_scopes WHERE consent_id=${activeConsentId}::uuid RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
    for (const scope of scopes) {
      const descriptions: Record<string, string> = { openid: "OpenID Connect sign-in", profile: "Basic profile information, including profile picture", email: "Email address and verification status", "users:read": "Read user data", "users:write": "Write user data", "oauth:read": "Read OAuth applications", "oauth:write": "Manage OAuth applications", "mcp:connect": "Connect to OneAuth MCP", offline_access: "Obtain refresh tokens", "custom_data:read": "Read only explicitly requested custom-data fields", "custom_data:write": "Write this app's private custom data" };
      await db.runtime().query(db.raw.sql`INSERT INTO public.oauth_scopes (id,name,description,is_default,created_at) VALUES (${randomUUID()}::uuid,${scope},${descriptions[scope] ?? "OneAuth permission"},false,now()) ON CONFLICT (name) DO NOTHING RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
      const prior = await db.runtime().query(db.raw.sql`SELECT id FROM public.oauth_consent_scopes WHERE consent_id=${activeConsentId}::uuid AND scope_name=${scope} LIMIT 1`.returnsRow({ id: "pg/uuid@1" }).build());
      if (!prior.length) await db.runtime().query(db.raw.sql`INSERT INTO public.oauth_consent_scopes (id,consent_id,scope_name,granted_at) VALUES (${randomUUID()}::uuid,${activeConsentId}::uuid,${scope},now()) RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
    }
    // Provision once, after this user approves the registered Agent client.
    if (client.clientId === "oa_jveGzDNEj0by9neUceFrElkYfvGZHq4f" && scopes.includes("tunnel:manage")) {
      await ensureAgentTunnel(user.id, user.username);
    }
    const rawCode = randomBytes(32).toString("base64url");
    await db.runtime().query(db.raw.sql`INSERT INTO public.authorization_codes (id,code_hash,oauth_client_id,user_id,redirect_uri,pkce_challenge,pkce_challenge_method,scopes,nonce,resource,expires_at,issued_at) VALUES (${randomUUID()}::uuid,${hashOpaqueToken(rawCode)},${client.id}::uuid,${user.id}::uuid,${redirectUri},${challenge},'S256',string_to_array(${scopes.join(" ")},' '),NULLIF(${nonce},''),${resource},now()+interval '5 minutes',now()) RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
    if (client.organizationId) await db.runtime().query(db.raw.sql`INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at) VALUES (${randomUUID()}::uuid,${user.id}::uuid,${client.organizationId}::uuid,'oauth.authorization.approved','oauth_client',${client.id},jsonb_build_object('scope_count',${scopes.length}::int),now()) RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
    redirect.searchParams.set("code", rawCode); redirect.searchParams.set("state", state); redirect.searchParams.set("iss", getIssuer());
    const response = NextResponse.json({ redirect: redirect.toString() }, { headers: { "Cache-Control": "no-store" } }); response.cookies.set(csrfCookie, "", { path: "/api/oauth/authorize", maxAge: 0 }); return response;
  } catch (error) {
    // Keep the consent flow diagnosable: previously an unexpected database or
    // runtime exception surfaced as an opaque framework error with no useful UI.
    console.error("[oauth/authorize] Consent POST failed", error);
    return apiError("Authorization could not be completed. Please retry; check server logs if the problem continues.", 500);
  }
}
