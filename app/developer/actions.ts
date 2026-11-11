"use server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { requireDeveloperOrganization } from "./access";
import { db } from "@/src/prisma/db";
import { allowsHttpLoopbackRedirect } from "@/src/lib/oauth/validation";

export type DeveloperClient = { id:string; clientId:string; name:string; description:string|null; clientType:string; environment:"DEVELOPMENT"|"PRODUCTION"; isActive:boolean; createdAt:string; redirectUris:string[]; scopes:string[] };

export async function getDeveloperClients(): Promise<DeveloperClient[]> {
  const { organization } = await requireDeveloperOrganization();
  const rows = await db.runtime().query(db.raw.sql`SELECT c.id,c.client_id AS "clientId",c.name,c.description,c.client_type AS "clientType",c.environment,c.is_active AS "isActive",c.created_at AS "createdAt",COALESCE(string_agg(DISTINCT r.uri,chr(10) ORDER BY r.uri) FILTER (WHERE r.uri IS NOT NULL),'') AS "redirectUris",COALESCE(string_agg(DISTINCT s.name,chr(10) ORDER BY s.name) FILTER (WHERE s.name IS NOT NULL),'') AS scopes FROM public.oauth_clients c LEFT JOIN public.oauth_redirect_uris r ON r.oauth_client_id=c.id LEFT JOIN public.oauth_client_scopes cs ON cs.oauth_client_id=c.id LEFT JOIN public.oauth_scopes s ON s.name=cs.scope_name WHERE c.organization_id=${organization.id}::uuid AND c.deleted_at IS NULL GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`.returnsRow({id:"pg/uuid@1",clientId:"pg/text@1",name:"pg/text@1",description:"pg/text@1",clientType:"pg/text@1",environment:"pg/text@1",isActive:"pg/bool@1",createdAt:"pg/timestamptz-string@1",redirectUris:"pg/text@1",scopes:"pg/text@1"}).build());
  return rows.map((row) => ({...row, environment:row.environment as "DEVELOPMENT"|"PRODUCTION", createdAt:String(row.createdAt), redirectUris:typeof row.redirectUris==="string"&&row.redirectUris?row.redirectUris.split("\n"):[], scopes:typeof row.scopes==="string"&&row.scopes?row.scopes.split("\n"):[]})) as DeveloperClient[];
}

export async function registerDeveloperClient(input:{name:string;description:string;clientType:"WEB"|"SPA_PUBLIC"|"NATIVE"|"DESKTOP"|"CLI"|"SERVICE";environment:"DEVELOPMENT"|"PRODUCTION";redirectUris:string[];scopes:string[]}) {
  const {user,organization}=await requireDeveloperOrganization();
  if(!input||typeof input.name!=="string"||typeof input.description!=="string"||!["WEB","SPA_PUBLIC","NATIVE","DESKTOP","CLI","SERVICE"].includes(input.clientType)||!["DEVELOPMENT","PRODUCTION"].includes(input.environment)||!Array.isArray(input.redirectUris)||!Array.isArray(input.scopes)) throw new Error("INVALID_OAUTH_CLIENT");
  const name=input.name.trim(), description=input.description.trim();
  const redirectUris=[...new Set(input.redirectUris.map((uri)=>String(uri).trim()).filter(Boolean))];
  const scopes=[...new Set(input.scopes)];
  if(!name||name.length>100) throw new Error("APP_NAME_REQUIRED_MAX_100");
  if(description.length>500) throw new Error("DESCRIPTION_MAX_500");
  if(redirectUris.length<1||redirectUris.length>20) throw new Error("ADD_1_TO_20_REDIRECT_URIS");
  if(!scopes.length||scopes.length>11||scopes.some(scope=>!([...["openid","profile","email","users:read","users:write","oauth:read","oauth:write","mcp:connect","offline_access","custom_data:read","custom_data:write"]]).includes(scope))) throw new Error("SELECT_VALID_OAUTH_SCOPES");
  for(const uri of redirectUris){
    let parsed:URL; try{parsed=new URL(uri)}catch{throw new Error("INVALID_REDIRECT_URI")}
    if(parsed.protocol!=="https:"&&!(allowsHttpLoopbackRedirect(input.environment,input.clientType)&&parsed.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(parsed.hostname))) throw new Error(input.environment==="PRODUCTION"?"PRODUCTION_REDIRECT_URI_MUST_USE_HTTPS":"REDIRECT_URI_MUST_USE_HTTPS");
    if(parsed.hash||parsed.username||parsed.password) throw new Error("REDIRECT_URI_MUST_NOT_CONTAIN_FRAGMENT_OR_CREDENTIALS");
  }
  const id=randomUUID(),clientId=`oa_${randomBytes(24).toString("base64url")}`;
  const isPublicClient=["SPA_PUBLIC","NATIVE","DESKTOP","CLI"].includes(input.clientType);
  const clientSecret=isPublicClient?null:`oas_${randomBytes(32).toString("base64url")}`;
  const secretHash=clientSecret?createHash("sha256").update(clientSecret).digest("hex"):"";
  const uriList=redirectUris.join("\n"), scopeList=scopes.join(" ");
  const scopeDescriptions:Record<string,string>={openid:"OpenID Connect sign-in",profile:"Basic profile information",email:"Email address and verification status","users:read":"Read user data","users:write":"Write user data","oauth:read":"Read OAuth applications","oauth:write":"Manage OAuth applications","mcp:connect":"Connect to OneAuth MCP",offline_access:"Obtain refresh tokens"};
  await db.runtime().query(db.raw.sql`WITH requested_scopes AS MATERIALIZED (
    SELECT unnest(string_to_array(${scopeList}::text,' ')) AS scope_name
  ), scope_catalog AS (
    INSERT INTO public.oauth_scopes (id,name,description,is_default,created_at)
    SELECT gen_random_uuid(),requested_scopes.scope_name,(${JSON.stringify(scopeDescriptions)}::jsonb)->>requested_scopes.scope_name,false,now() FROM requested_scopes
    ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING name
  ), inserted AS (
    INSERT INTO public.oauth_clients (id,client_id,client_secret_hash,name,description,client_type,environment,token_endpoint_auth_method,grant_types,response_types,organization_id,owner_user_id,is_active,created_at,updated_at)
    VALUES (${id}::uuid,${clientId}::text,NULLIF(${secretHash}::text,''),${name}::text,NULLIF(${description}::text,''),${input.clientType}::text,${input.environment}::text,${isPublicClient?"NONE":"CLIENT_SECRET_POST"}::text,ARRAY['authorization_code','refresh_token']::text[],ARRAY['code']::text[],${organization.id}::uuid,NULL,true,now(),now()) RETURNING id,client_id
  ), inserted_redirects AS (
    INSERT INTO public.oauth_redirect_uris (id,oauth_client_id,uri,created_at)
    SELECT gen_random_uuid(),inserted.id,u.uri,now() FROM inserted CROSS JOIN unnest(string_to_array(${uriList}::text,chr(10))) AS u(uri)
    RETURNING id
  ), inserted_client_scopes AS (
    INSERT INTO public.oauth_client_scopes (id,oauth_client_id,scope_name,created_at)
    SELECT gen_random_uuid(),inserted.id,requested_scopes.scope_name,now() FROM inserted CROSS JOIN requested_scopes JOIN scope_catalog ON scope_catalog.name=requested_scopes.scope_name
    RETURNING id
  ), audited AS (
    INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at)
    SELECT gen_random_uuid(),${user.id}::uuid,${organization.id}::uuid,'oauth_client.created','oauth_client',inserted.id::text,jsonb_build_object('client_id',inserted.client_id,'type',${input.clientType}::text,'environment',${input.environment}::text,'scopes',${scopeList}::text),now() FROM inserted RETURNING id
  ) SELECT inserted.id FROM inserted CROSS JOIN (SELECT count(*) FROM inserted_redirects) redirects CROSS JOIN (SELECT count(*) FROM inserted_client_scopes) client_scopes CROSS JOIN (SELECT count(*) FROM audited) audit_count`.returnsRow({id:"pg/uuid@1"}).build());
  return {success:true,clientId,clientSecret,clientType:input.clientType,environment:input.environment,scopes};
}

export async function updateDeveloperClient(input: { id: string; name: string; description: string; isActive: boolean }) {
  const { user, organization } = await requireDeveloperOrganization();
  if (!input || typeof input.id !== "string" || typeof input.name !== "string" || typeof input.description !== "string" || typeof input.isActive !== "boolean") throw new Error("INVALID_APPLICATION_SETTINGS");
  const name = input.name.trim(), description = input.description.trim();
  if (!name || name.length > 100 || description.length > 500) throw new Error("CHECK_APPLICATION_NAME_AND_DESCRIPTION");
  const result = await db.runtime().query(db.raw.sql`UPDATE public.oauth_clients SET name=${name},description=NULLIF(${description},''),is_active=${input.isActive},updated_at=now() WHERE id=${input.id}::uuid AND organization_id=${organization.id}::uuid AND deleted_at IS NULL RETURNING id,client_id,environment`.returnsRow({id:"pg/uuid@1",client_id:"pg/text@1",environment:"pg/text@1"}).build());
  if (!result.length) throw new Error("APPLICATION_NOT_FOUND_OR_ACCESS_DENIED");
  await db.runtime().query(db.raw.sql`INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at) VALUES (${randomUUID()}::uuid,${user.id}::uuid,${organization.id}::uuid,${input.isActive?"oauth_client.updated":"oauth_client.disabled"},'oauth_client',${input.id}::text,jsonb_build_object('client_id',${result[0].client_id},'active',${input.isActive},'environment',${result[0].environment}),now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  return { success: true };
}

export async function updateDeveloperRedirectUris(input: { id: string; redirectUris: string[] }) {
  const { user, organization } = await requireDeveloperOrganization();
  if (!input || typeof input.id !== "string" || !Array.isArray(input.redirectUris)) throw new Error("INVALID_REDIRECT_URI_SETTINGS");
  const uris = [...new Set(input.redirectUris.map((value) => String(value).trim()).filter(Boolean))];
  if (uris.length < 1 || uris.length > 20) throw new Error("ADD_1_TO_20_REDIRECT_URIS");
  const owned = await db.runtime().query(db.raw.sql`SELECT id,client_id,environment,client_type FROM public.oauth_clients WHERE id=${input.id}::uuid AND organization_id=${organization.id}::uuid AND deleted_at IS NULL`.returnsRow({id:"pg/uuid@1",client_id:"pg/text@1",environment:"pg/text@1",client_type:"pg/text@1"}).build());
  if (!owned.length) throw new Error("APPLICATION_NOT_FOUND_OR_ACCESS_DENIED");
  for (const uri of uris) {
    let parsed: URL; try { parsed = new URL(uri); } catch { throw new Error("INVALID_REDIRECT_URI"); }
    if (parsed.protocol !== "https:" && !(allowsHttpLoopbackRedirect(owned[0].environment,owned[0].client_type) && parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) throw new Error("REDIRECT_URI_MUST_USE_HTTPS");
    if (parsed.hash || parsed.username || parsed.password) throw new Error("REDIRECT_URI_MUST_NOT_CONTAIN_FRAGMENT_OR_CREDENTIALS");
  }
  const uriList=uris.join("\n");
  await db.runtime().query(db.raw.sql`WITH target AS MATERIALIZED (
    SELECT id FROM public.oauth_clients WHERE id=${input.id}::uuid AND organization_id=${organization.id}::uuid AND deleted_at IS NULL
  ), deleted AS (
    DELETE FROM public.oauth_redirect_uris r USING target WHERE r.oauth_client_id=target.id RETURNING r.oauth_client_id
  ), inserted AS (
    INSERT INTO public.oauth_redirect_uris (id,oauth_client_id,uri,created_at)
    SELECT gen_random_uuid(),target.id,u.uri,now() FROM target CROSS JOIN unnest(string_to_array(${uriList}::text,chr(10))) AS u(uri)
    RETURNING id
  ), audited AS (
    INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at)
    SELECT gen_random_uuid(),${user.id}::uuid,${organization.id}::uuid,'oauth_client.redirect_uris.updated','oauth_client',${input.id}::text,jsonb_build_object('client_id',${owned[0].client_id}::text,'redirect_uri_count',${uris.length}::int,'environment',${owned[0].environment}::text),now() FROM target RETURNING id
  ) SELECT count(*)::int AS count FROM inserted`.returnsRow({count:"pg/int4@1"}).build());
  return { success: true, redirectUris: uris };
}
