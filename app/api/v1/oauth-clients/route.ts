import { db } from "@/src/prisma/db";
import { hashOpaqueToken } from "@/src/lib/oauth/protocol";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { getIssuer } from "@/src/lib/oauth/oidc";

export const runtime = "nodejs";

async function authenticate(request:Request) {
  const header=request.headers.get("authorization")??"";
  if(!header.startsWith("Bearer ")) return null;
  const token=header.slice(7).trim();
  if(!token||token.length>512) return null;
  const hash=hashOpaqueToken(token);
  if(token.startsWith("oak_")) {
    const rows=await db.runtime().query(db.raw.sql`SELECT k.organization_id AS "organizationId",k.environment,array_to_string(k.scopes,' ') AS scopes,k.expires_at AS "expiresAt",o.status AS "orgStatus",o.deleted_at AS "orgDeleted" FROM public.api_keys k JOIN public.organizations o ON o.id=k.organization_id WHERE k.secret_hash=${hash} AND k.revoked_at IS NULL LIMIT 1`.returnsRow({organizationId:"pg/text@1",environment:"pg/text@1",scopes:"pg/text@1",expiresAt:"pg/timestamptz-string@1",orgStatus:"pg/text@1",orgDeleted:"pg/timestamptz-string@1"}).build());
    const row=rows[0];
    if(!row||!row.organizationId||row.orgStatus!=="ACTIVE"||row.orgDeleted||(row.expiresAt&&new Date(row.expiresAt).getTime()<=Date.now())) return null;
    await db.runtime().query(db.raw.sql`UPDATE public.api_keys SET last_used_at=now() WHERE secret_hash=${hash} AND revoked_at IS NULL RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    return {organizationId:row.organizationId as string,environment:row.environment as string,scopes:row.scopes?row.scopes.split(" ").filter(Boolean):[],resource:null,source:"api_key" as const};
  }
  const rows=await db.runtime().query(db.raw.sql`SELECT c.organization_id AS "organizationId",c.environment,array_to_string(t.scopes,' ') AS scopes,t.resource,t.expires_at AS "expiresAt",u.status AS "userStatus",c.is_active AS "clientActive",c.deleted_at AS "clientDeleted",o.status AS "orgStatus",o.deleted_at AS "orgDeleted" FROM public.access_tokens t JOIN public.oauth_clients c ON c.id=t.oauth_client_id JOIN public.users u ON u.id=t.user_id LEFT JOIN public.organizations o ON o.id=c.organization_id WHERE t.token_hash=${hash} AND t.revoked_at IS NULL LIMIT 1`.returnsRow({organizationId:"pg/text@1",environment:"pg/text@1",scopes:"pg/text@1",resource:"pg/text@1",expiresAt:"pg/timestamptz-string@1",userStatus:"pg/text@1",clientActive:"pg/bool@1",clientDeleted:"pg/timestamptz-string@1",orgStatus:"pg/text@1",orgDeleted:"pg/timestamptz-string@1"}).build());
  const row=rows[0];
  if(!row||!row.organizationId||row.userStatus!=="ACTIVE"||!row.clientActive||row.clientDeleted||row.orgStatus!=="ACTIVE"||row.orgDeleted||new Date(row.expiresAt).getTime()<=Date.now()) return null;
  return {organizationId:row.organizationId as string,environment:row.environment as string,scopes:row.scopes?row.scopes.split(" ").filter(Boolean):[],resource:row.resource??null,source:"oauth" as const};
}

export async function GET(request:Request) {
  let identity;
  try { identity=await authenticate(request); }
  catch { return Response.json({error:"temporarily_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}}); }
  if(!identity) return Response.json({error:"invalid_token"},{status:401,headers:{"WWW-Authenticate":'Bearer error="invalid_token"',"Cache-Control":"no-store"}});
  if(identity.source==="oauth") { try { if(identity.resource!==getIssuer()+"/api/v1") return Response.json({error:"invalid_token"},{status:401,headers:{"WWW-Authenticate":'Bearer error="invalid_token"',"Cache-Control":"no-store"}}); } catch { return Response.json({error:"server_configuration_error"},{status:503,headers:{"Cache-Control":"no-store"}}); } }
  if(!identity.scopes.includes("oauth:read")) return Response.json({error:"insufficient_scope",required_scope:"oauth:read"},{status:403,headers:{"WWW-Authenticate":'Bearer error="insufficient_scope", scope="oauth:read"',"Cache-Control":"no-store"}});
  try {
    if(!(await allowOAuthRequest(request,"api-oauth-clients",120,60))) return Response.json({error:"rate_limited"},{status:429,headers:{"Retry-After":"60","Cache-Control":"no-store"}});
  } catch { return Response.json({error:"temporarily_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}}); }
  const rows=await db.runtime().query(db.raw.sql`SELECT c.client_id AS "clientId",c.name,c.description,c.client_type AS "clientType",c.environment,c.is_active AS "isActive",c.created_at::text AS "createdAt",COALESCE(string_agg(r.uri,chr(10) ORDER BY r.uri) FILTER (WHERE r.uri IS NOT NULL),'') AS "redirectUris" FROM public.oauth_clients c LEFT JOIN public.oauth_redirect_uris r ON r.oauth_client_id=c.id WHERE c.organization_id=${identity.organizationId}::uuid AND c.environment=${identity.environment} AND c.deleted_at IS NULL GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`.returnsRow({clientId:"pg/text@1",name:"pg/text@1",description:"pg/text@1",clientType:"pg/text@1",environment:"pg/text@1",isActive:"pg/bool@1",createdAt:"pg/text@1",redirectUris:"pg/text@1"}).build());
  return Response.json({clients:rows.map(row=>({...row,redirectUris:row.redirectUris?row.redirectUris.split("\n"):[]}))},{headers:{"Cache-Control":"no-store","Vary":"Authorization"}});
}
