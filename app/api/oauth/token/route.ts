
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { findClient, hashOpaqueToken, oauthError, safeEqual, createPkceChallenge } from "@/src/lib/oauth/protocol";
import { signIdToken } from "@/src/lib/oauth/oidc";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { isFormUrlEncodedContentType } from "@/src/lib/oauth/validation";

export const runtime = "nodejs";
const accessLifetime = 15 * 60;


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
  const actual = createHash("sha256").update(secret).digest("hex");
  return safeEqual(actual, client.secretHash) ? client : null;
}

async function issueTokens(client: {id:string;clientId:string}, userId: string, scopes: string[], nonce: string | null, resource: string, familyId?: string, replacementOfId?: string) {
  const accessToken = randomBytes(32).toString("base64url");
  const accessId = randomUUID();
  await db.runtime().query(db.raw.sql`INSERT INTO public.access_tokens (id,token_hash,oauth_client_id,user_id,scopes,resource,issued_at,expires_at) VALUES (${accessId}::uuid,${hashOpaqueToken(accessToken)},${client.id}::uuid,${userId}::uuid,string_to_array(${scopes.join(" ")},' '),${resource},now(),now()+interval '15 minutes') RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  const response: Record<string, unknown> = {access_token:accessToken,token_type:"Bearer",expires_in:accessLifetime,scope:scopes.join(" ")};
  if (scopes.includes("offline_access")) {
    const refreshToken = randomBytes(40).toString("base64url");
    const refreshId = randomUUID();
    const insertedRefresh = await db.runtime().query(db.raw.sql`INSERT INTO public.refresh_tokens (id,token_hash,oauth_client_id,user_id,family_id,replacement_of_id,scopes,resource,issued_at,expires_at) SELECT ${refreshId}::uuid,${hashOpaqueToken(refreshToken)},${client.id}::uuid,${userId}::uuid,${familyId ?? refreshId}::uuid,NULLIF(${replacementOfId ?? ""},'')::uuid,string_to_array(${scopes.join(" ")},' '),${resource},now(),now()+interval '30 days' WHERE NOT EXISTS (SELECT 1 FROM public.refresh_tokens WHERE family_id=${familyId ?? refreshId}::uuid AND reuse_detected_at IS NOT NULL) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    if (!insertedRefresh.length) {
      await db.runtime().query(db.raw.sql`UPDATE public.access_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE id=${accessId}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
      throw new Error("REFRESH_TOKEN_FAMILY_REVOKED");
    }
    response.refresh_token = refreshToken;
  }
  if (scopes.includes("openid")) response.id_token = await signIdToken({userId,clientId:client.clientId,nonce,scopes});
  return response;
}

export async function POST(request: Request) {
  try {
    if (!isFormUrlEncodedContentType(request.headers.get("content-type"))) return oauthError("invalid_request",400,"Use application/x-www-form-urlencoded.");
    try { if (!(await allowOAuthRequest(request,"token-preauth",120,60))) return oauthError("temporarily_unavailable",429,"Too many requests. Retry later."); } catch { return oauthError("temporarily_unavailable",503,"Rate limiting is temporarily unavailable."); }
    const form = await request.formData();
    const grantType = String(form.get("grant_type") ?? "");
    const client = await authenticateClient(request,form);
    if (!client) return oauthError("invalid_client",401);
    try {
      if (!(await allowOAuthRequest(request,`token:${client.clientId}`,60,60)) ) return oauthError("temporarily_unavailable",429,"Too many requests. Retry later.");
    } catch { return oauthError("temporarily_unavailable",503,"Rate limiting is temporarily unavailable."); }
    if (!client.grantTypes.includes(grantType)) return oauthError("unauthorized_client",400);

    if (grantType === "authorization_code") {
      const code=String(form.get("code") ?? ""), redirectUri=String(form.get("redirect_uri") ?? ""), verifier=String(form.get("code_verifier") ?? "");
      if (!code || !redirectUri || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return oauthError("invalid_request",400);
      const rows=await db.runtime().query(db.raw.sql`SELECT id,user_id AS "userId",redirect_uri AS "redirectUri",pkce_challenge AS challenge,array_to_string(scopes,' ') AS scopes,nonce,resource,expires_at AS "expiresAt",consumed_at AS "consumedAt" FROM public.authorization_codes WHERE code_hash=${hashOpaqueToken(code)} AND oauth_client_id=${client.id}::uuid LIMIT 1`.returnsRow({id:"pg/uuid@1",userId:"pg/uuid@1",redirectUri:"pg/text@1",challenge:"pg/text@1",scopes:"pg/text@1",nonce:"pg/text@1",resource:"pg/text@1",expiresAt:"pg/timestamptz-string@1",consumedAt:"pg/timestamptz-string@1"}).build());
      const row=rows[0];
      if (!row || row.consumedAt || new Date(row.expiresAt).getTime()<=Date.now() || row.redirectUri!==redirectUri || !safeEqual(createPkceChallenge(verifier),row.challenge)) return oauthError("invalid_grant",400);
      const active=await db.runtime().query(db.raw.sql`SELECT id FROM public.users WHERE id=${row.userId}::uuid AND status='ACTIVE' AND deleted_at IS NULL LIMIT 1`.returnsRow({id:"pg/uuid@1"}).build());
      if (!active.length) return oauthError("invalid_grant",400);
      const consumed=await db.runtime().query(db.raw.sql`UPDATE public.authorization_codes SET consumed_at=now() WHERE id=${row.id}::uuid AND consumed_at IS NULL AND expires_at>now() RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
      if (!consumed.length) return oauthError("invalid_grant",400);
      const tokens=await issueTokens(client,row.userId,row.scopes?row.scopes.split(" ").filter(Boolean):[],row.nonce,row.resource);
      return NextResponse.json(tokens,{headers:{"Cache-Control":"no-store",Pragma:"no-cache"}});
    }

    if (grantType === "refresh_token") {
      const raw=String(form.get("refresh_token") ?? "");
      if (!raw) return oauthError("invalid_request",400);
      const rows=await db.runtime().query(db.raw.sql`SELECT id,user_id AS "userId",family_id AS "familyId",array_to_string(scopes,' ') AS scopes,resource,expires_at AS "expiresAt",revoked_at AS "revokedAt" FROM public.refresh_tokens WHERE token_hash=${hashOpaqueToken(raw)} AND oauth_client_id=${client.id}::uuid LIMIT 1`.returnsRow({id:"pg/uuid@1",userId:"pg/uuid@1",familyId:"pg/uuid@1",scopes:"pg/text@1",resource:"pg/text@1",expiresAt:"pg/timestamptz-string@1",revokedAt:"pg/timestamptz-string@1"}).build());
      const row=rows[0];
      if (!row) return oauthError("invalid_grant",400);
      if (row.revokedAt) {
        await db.runtime().query(db.raw.sql`UPDATE public.refresh_tokens SET revoked_at=COALESCE(revoked_at,now()),reuse_detected_at=COALESCE(reuse_detected_at,now()) WHERE family_id=${row.familyId}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
        return oauthError("invalid_grant",400,"Refresh token reuse detected; sign in again.");
      }
      if (new Date(row.expiresAt).getTime()<=Date.now() || !row.userId) return oauthError("invalid_grant",400);
      const active=await db.runtime().query(db.raw.sql`SELECT id FROM public.users WHERE id=${row.userId}::uuid AND status='ACTIVE' AND deleted_at IS NULL LIMIT 1`.returnsRow({id:"pg/uuid@1"}).build());
      if (!active.length) return oauthError("invalid_grant",400);
      const revoked=await db.runtime().query(db.raw.sql`UPDATE public.refresh_tokens SET revoked_at=now() WHERE id=${row.id}::uuid AND revoked_at IS NULL AND expires_at>now() RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
      if (!revoked.length) {
        // Another request may have rotated this token after our initial SELECT.
        // Re-check persisted state and revoke the family on concurrent reuse too.
        const latest = await db.runtime().query(db.raw.sql`SELECT revoked_at AS "revokedAt" FROM public.refresh_tokens WHERE id=${row.id}::uuid LIMIT 1`.returnsRow({revokedAt:"pg/timestamptz-string@1"}).build());
        if (latest[0]?.revokedAt) {
          await db.runtime().query(db.raw.sql`UPDATE public.refresh_tokens SET revoked_at=COALESCE(revoked_at,now()),reuse_detected_at=COALESCE(reuse_detected_at,now()) WHERE family_id=${row.familyId}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
          return oauthError("invalid_grant",400,"Refresh token reuse detected; sign in again.");
        }
        return oauthError("invalid_grant",400);
      }
      const tokens=await issueTokens(client,row.userId,row.scopes?row.scopes.split(" ").filter(Boolean):[],null,row.resource,row.familyId,row.id);
      return NextResponse.json(tokens,{headers:{"Cache-Control":"no-store",Pragma:"no-cache"}});
    }
    return oauthError("unsupported_grant_type",400);
  } catch (error) {
    if (error instanceof Error && error.message === "REFRESH_TOKEN_FAMILY_REVOKED") {
      return oauthError("invalid_grant",400,"Refresh token reuse detected; sign in again.");
    }
    console.error("OAuth token endpoint error:",error instanceof Error?error.message:"unknown");
    return oauthError("server_error",500);
  }
}
