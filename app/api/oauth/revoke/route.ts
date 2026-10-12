import { createHash } from "node:crypto";
import { db } from "@/src/prisma/db";
import { findClient, hashOpaqueToken, oauthError, safeEqual } from "@/src/lib/oauth/protocol";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { isFormUrlEncodedContentType } from "@/src/lib/oauth/validation";
export const runtime = "nodejs";

export async function POST(request: Request) {
    try { if (!(await allowOAuthRequest(request,"revoke-preauth",120,60))) return oauthError("temporarily_unavailable",429); } catch { return oauthError("temporarily_unavailable",503); }
  try {
    if(!isFormUrlEncodedContentType(request.headers.get("content-type"))) return oauthError("invalid_request",400,"Use application/x-www-form-urlencoded.");
    const form=await request.formData();
    const token=String(form.get("token") ?? "");
    let clientId=String(form.get("client_id") ?? "");
    let secret=String(form.get("client_secret") ?? "");
    let method:"basic"|"post"|"none"=secret?"post":"none";
    const header=request.headers.get("authorization");
    if(header) {
      if(!header.startsWith("Basic ") || secret) return oauthError("invalid_client",401);
      try {
        const decoded=Buffer.from(header.slice(6),"base64").toString("utf8"), i=decoded.indexOf(":");
        if(i<1) return oauthError("invalid_client",401);
        const basicId=decodeURIComponent(decoded.slice(0,i));
        if(clientId && clientId!==basicId) return oauthError("invalid_client",401);
        clientId=basicId;
        secret=decodeURIComponent(decoded.slice(i+1));
        method="basic";
      } catch { return oauthError("invalid_client",401); }
    }
    if(!clientId || !token) return oauthError("invalid_request",400);
    const client=await findClient(clientId);
    if(!client) return oauthError("invalid_client",401);
    if(client.authMethod==="NONE") {
      if(method!=="none") return oauthError("invalid_client",401);
    } else {
      if((client.authMethod==="CLIENT_SECRET_BASIC" && method!=="basic") ||
         (client.authMethod==="CLIENT_SECRET_POST" && method!=="post") ||
         !client.secretHash || !secret ||
         !safeEqual(createHash("sha256").update(secret).digest("hex"),client.secretHash)) return oauthError("invalid_client",401);
    }
    const hash=hashOpaqueToken(token);
    await db.runtime().query(db.raw.sql`UPDATE public.access_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=${hash} AND oauth_client_id=${client.id}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    const refresh=await db.runtime().query(db.raw.sql`SELECT family_id AS "familyId" FROM public.refresh_tokens WHERE token_hash=${hash} AND oauth_client_id=${client.id}::uuid LIMIT 1`.returnsRow({familyId:"pg/uuid@1"}).build());
    if(refresh[0]) await db.runtime().query(db.raw.sql`UPDATE public.refresh_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE family_id=${refresh[0].familyId}::uuid RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    return new Response(null,{status:200,headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});
  } catch {
    return oauthError("server_error",500);
  }
}
