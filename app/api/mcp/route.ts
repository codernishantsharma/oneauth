import { db } from "@/src/prisma/db";
import { hashOpaqueToken } from "@/src/lib/oauth/protocol";
import { allowOAuthRequest } from "@/src/lib/oauth/rate-limit";
import { getIssuer } from "@/src/lib/oauth/oidc";

export const runtime = "nodejs";
type Principal = { userId:string|null; organizationId:string; environment:"DEVELOPMENT"|"PRODUCTION"; scopes:string[]; resource:string|null; source:"api_key"|"oauth" };

async function authenticate(request:Request):Promise<Principal|null> {
  const header=request.headers.get("authorization")??"";
  if(!header.startsWith("Bearer ")) return null;
  const token=header.slice(7).trim();
  if(!token||token.length>512) return null;
  const hash=hashOpaqueToken(token);
  if(token.startsWith("oak_")) {
    const rows=await db.runtime().query(db.raw.sql`SELECT k.user_id AS "userId",k.organization_id AS "organizationId",k.environment,array_to_string(k.scopes,' ') AS scopes,k.expires_at AS "expiresAt",o.status AS "orgStatus",o.deleted_at AS "orgDeleted" FROM public.api_keys k JOIN public.organizations o ON o.id=k.organization_id WHERE k.secret_hash=${hash} AND k.revoked_at IS NULL LIMIT 1`.returnsRow({userId:"pg/text@1",organizationId:"pg/text@1",environment:"pg/text@1",scopes:"pg/text@1",expiresAt:"pg/timestamptz-string@1",orgStatus:"pg/text@1",orgDeleted:"pg/timestamptz-string@1"}).build());
    const row=rows[0];
    if(!row||!row.organizationId||row.orgStatus!=="ACTIVE"||row.orgDeleted||(row.expiresAt&&new Date(row.expiresAt).getTime()<=Date.now())) return null;
    await db.runtime().query(db.raw.sql`UPDATE public.api_keys SET last_used_at=now() WHERE secret_hash=${hash} AND revoked_at IS NULL RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
    return {userId:row.userId||null,organizationId:row.organizationId,environment:row.environment as "DEVELOPMENT"|"PRODUCTION",scopes:row.scopes?row.scopes.split(" ").filter(Boolean):[],resource:null,source:"api_key" as const};
  }
  const rows=await db.runtime().query(db.raw.sql`SELECT t.user_id AS "userId",c.organization_id AS "organizationId",c.environment,array_to_string(t.scopes,' ') AS scopes,t.resource,t.expires_at AS "expiresAt",u.status AS "userStatus",c.is_active AS "clientActive",c.deleted_at AS "clientDeleted",o.status AS "orgStatus",o.deleted_at AS "orgDeleted" FROM public.access_tokens t JOIN public.oauth_clients c ON c.id=t.oauth_client_id LEFT JOIN public.users u ON u.id=t.user_id LEFT JOIN public.organizations o ON o.id=c.organization_id WHERE t.token_hash=${hash} AND t.revoked_at IS NULL LIMIT 1`.returnsRow({userId:"pg/text@1",organizationId:"pg/text@1",environment:"pg/text@1",scopes:"pg/text@1",resource:"pg/text@1",expiresAt:"pg/timestamptz-string@1",userStatus:"pg/text@1",clientActive:"pg/bool@1",clientDeleted:"pg/timestamptz-string@1",orgStatus:"pg/text@1",orgDeleted:"pg/timestamptz-string@1"}).build());
  const row=rows[0];
  if(!row||!row.organizationId||row.userStatus!=="ACTIVE"||!row.clientActive||row.clientDeleted||row.orgStatus!=="ACTIVE"||row.orgDeleted||new Date(row.expiresAt).getTime()<=Date.now()) return null;
  return {userId:row.userId,organizationId:row.organizationId,environment:row.environment as "DEVELOPMENT"|"PRODUCTION",scopes:row.scopes?row.scopes.split(" ").filter(Boolean):[],resource:row.resource??null,source:"oauth" as const};
}
function resourceAllowed(principal:Principal) {
  if(principal.source==="api_key") return true;
  try { return principal.resource===getIssuer()+"/api/mcp"; } catch { return false; }
}

function jsonRpc(id:unknown,result:unknown) { return Response.json({jsonrpc:"2.0",id,result},{headers:{"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"}}); }
function rpcError(id:unknown,code:number,message:string) { return Response.json({jsonrpc:"2.0",id,error:{code,message}},{headers:{"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"}}); }
function mcpResult(text:string,structuredContent?:unknown) { return {content:[{type:"text",text}],...(structuredContent===undefined?{}:{structuredContent}),isError:false}; }
function cors(response:Response,origin:string|null) {
  const allowed=(process.env.MCP_ALLOWED_ORIGINS??"").split(",").map(v=>v.trim()).filter(Boolean);
  if(origin&&allowed.includes(origin)){response.headers.set("Access-Control-Allow-Origin",origin);response.headers.set("Vary","Origin");}
  return response;
}

async function handlePost(request:Request) {
  const allowed=(process.env.MCP_ALLOWED_ORIGINS??"").split(",").map(v=>v.trim()).filter(Boolean);
  const origin=request.headers.get("origin");
  if(origin&&!allowed.includes(origin)) return Response.json({error:"origin_not_allowed"},{status:403});
  try { if (!(await allowOAuthRequest(request,"mcp-preauth",300,60))) return Response.json({error:"rate_limited"},{status:429,headers:{"Retry-After":"60","Cache-Control":"no-store"}}); }
  catch { return Response.json({error:"temporarily_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}}); }
  const principal=await authenticate(request);

  if(!principal||!principal.scopes.includes("mcp:connect")||!resourceAllowed(principal)) return Response.json({error:"unauthorized"},{status:401,headers:{"WWW-Authenticate":'Bearer realm="OneAuth MCP", error="invalid_token"',"Cache-Control":"no-store"}});
  try {
    if (!(await allowOAuthRequest(request, `mcp:${principal.organizationId}:${principal.environment}`, 300, 60))) return Response.json({error:"rate_limited"},{status:429,headers:{"Retry-After":"60","Cache-Control":"no-store"}});
  } catch { return Response.json({error:"temporarily_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}}); }
  if(!(request.headers.get("content-type")??"").toLowerCase().includes("application/json")) return rpcError(null,-32600,"Content-Type must be application/json");
  let message:unknown;
  try{message=await request.json()}catch{return rpcError(null,-32700,"Parse error")}
  if(!message||typeof message!=="object"||Array.isArray(message)) return rpcError(null,-32600,"Invalid Request");
  const rpc=message as {jsonrpc?:unknown;id?:unknown;method?:unknown;params?:unknown};
  if(rpc.jsonrpc!=="2.0"||typeof rpc.method!=="string") return rpcError(rpc.id??null,-32600,"Invalid Request");
  if(rpc.method==="notifications/initialized"||rpc.method==="notifications/cancelled") return new Response(null,{status:202,headers:{"Cache-Control":"no-store"}});
  if(rpc.method==="initialize") return jsonRpc(rpc.id??null,{protocolVersion:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"OneAuth Developer MCP",version:"1.0.0"},instructions:"Tools are restricted to the organization and environment attached to the authenticated credential. Use least-privilege scopes."});
  if(rpc.method==="ping") return jsonRpc(rpc.id??null,{});
  if(rpc.method==="tools/list") {
    const tools=[
      {name:"organization.get",description:"Get the authenticated credential's organization identity.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
      ...(principal.scopes.includes("oauth:read")?[{name:"oauth.clients.list",description:"List OAuth applications in the same organization and environment. Requires oauth:read.",inputSchema:{type:"object",properties:{},additionalProperties:false}}]:[])
    ];
    return jsonRpc(rpc.id??null,{tools});
  }
  if(rpc.method==="tools/call") {
    const params=rpc.params&&typeof rpc.params==="object"?rpc.params as {name?:unknown;arguments?:unknown}:{};
    const name=typeof params.name==="string"?params.name:"";
    if(name==="organization.get") {
      const rows=await db.runtime().query(db.raw.sql`SELECT id,name,slug,status FROM public.organizations WHERE id=${principal.organizationId}::uuid AND status='ACTIVE' AND deleted_at IS NULL LIMIT 1`.returnsRow({id:"pg/uuid@1",name:"pg/text@1",slug:"pg/text@1",status:"pg/text@1"}).build());
      if(!rows.length) return rpcError(rpc.id??null,-32001,"Organization unavailable");
      return jsonRpc(rpc.id??null,mcpResult(JSON.stringify(rows[0]),rows[0]));
    }
    if(name==="oauth.clients.list") {
      if(!principal.scopes.includes("oauth:read")) return rpcError(rpc.id??null,-32003,"Missing required scope: oauth:read");
      const rows=await db.runtime().query(db.raw.sql`SELECT c.client_id AS "clientId",c.name,c.description,c.client_type AS "clientType",c.environment,c.is_active AS "isActive",c.created_at::text AS "createdAt",COALESCE(string_agg(r.uri,chr(10) ORDER BY r.uri) FILTER (WHERE r.uri IS NOT NULL),'') AS "redirectUris" FROM public.oauth_clients c LEFT JOIN public.oauth_redirect_uris r ON r.oauth_client_id=c.id WHERE c.organization_id=${principal.organizationId}::uuid AND c.environment=${principal.environment} AND c.deleted_at IS NULL GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`.returnsRow({clientId:"pg/text@1",name:"pg/text@1",description:"pg/text@1",clientType:"pg/text@1",environment:"pg/text@1",isActive:"pg/bool@1",createdAt:"pg/text@1",redirectUris:"pg/text@1"}).build());
      return jsonRpc(rpc.id??null,mcpResult(JSON.stringify(rows),{clients:rows}));
    }
    return rpcError(rpc.id??null,-32602,"Unknown tool or missing permission");
  }
  return rpcError(rpc.id??null,-32601,"Method not found");
}

export async function POST(request:Request) { return cors(await handlePost(request),request.headers.get("origin")); }
export async function GET(request:Request) {
  const principal=await authenticate(request);
  if(!principal||!principal.scopes.includes("mcp:connect")||!resourceAllowed(principal)) return Response.json({error:"unauthorized"},{status:401,headers:{"WWW-Authenticate":'Bearer realm="OneAuth MCP"',"Cache-Control":"no-store"}});
  return new Response(null,{status:405,headers:{"Allow":"POST, OPTIONS","Cache-Control":"no-store"}});
}
export async function OPTIONS(request:Request) {
  const allowed=(process.env.MCP_ALLOWED_ORIGINS??"").split(",").map(v=>v.trim()).filter(Boolean);
  const origin=request.headers.get("origin");
  if(!origin||!allowed.includes(origin)) return new Response(null,{status:403});
  return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type, MCP-Protocol-Version","Access-Control-Max-Age":"600","Vary":"Origin"}});
}
