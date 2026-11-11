"use server";

import { requireDeveloperOrganization } from "./access";
import { db } from "@/src/prisma/db";

export async function updateDeveloperClientScopes(input:{id:string;scopes:string[]}) {
  const {user,organization}=await requireDeveloperOrganization();
  if(!input||typeof input.id!=="string"||!/^[0-9a-f-]{36}$/i.test(input.id)||!Array.isArray(input.scopes)) throw new Error("INVALID_SCOPE_SETTINGS");
  const scopes=[...new Set(input.scopes)];
  const allowed=["openid","profile","email","users:read","users:write","oauth:read","oauth:write","mcp:connect","offline_access","custom_data:read","custom_data:write"];
  if(!scopes.length||scopes.length>allowed.length||scopes.some(scope=>!allowed.includes(scope))) throw new Error("SELECT_VALID_OAUTH_SCOPES");
  const client=await db.runtime().query(db.raw.sql`SELECT client_id,environment FROM public.oauth_clients WHERE id=${input.id}::uuid AND organization_id=${organization.id}::uuid AND deleted_at IS NULL`.returnsRow({client_id:"pg/text@1",environment:"pg/text@1"}).build());
  if(!client.length) throw new Error("APPLICATION_NOT_FOUND_OR_ACCESS_DENIED");
  const scopeList=scopes.join(" ");
  const descriptions:Record<string,string>={openid:"OpenID Connect sign-in",profile:"Basic profile information including profile picture",email:"Email address and verification status","users:read":"Read user data","users:write":"Write user data","oauth:read":"Read OAuth applications","oauth:write":"Manage OAuth applications","mcp:connect":"Connect to OneAuth MCP",offline_access:"Obtain refresh tokens","custom_data:read":"Read only fields explicitly granted by the user","custom_data:write":"Write this application's private custom data"};
  await db.runtime().query(db.raw.sql`WITH requested AS MATERIALIZED (
    SELECT unnest(string_to_array(${scopeList},' ')) AS scope_name
  ), catalog AS (
    INSERT INTO public.oauth_scopes (id,name,description,is_default,created_at)
    SELECT gen_random_uuid(),requested.scope_name,${JSON.stringify(descriptions)}::jsonb->>requested.scope_name,false,now() FROM requested
    ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING name
  ), target AS MATERIALIZED (
    SELECT id FROM public.oauth_clients WHERE id=${input.id}::uuid AND organization_id=${organization.id}::uuid AND deleted_at IS NULL
  ), deleted AS (
    DELETE FROM public.oauth_client_scopes cs USING target WHERE cs.oauth_client_id=target.id RETURNING cs.id
  ), inserted AS (
    INSERT INTO public.oauth_client_scopes (id,oauth_client_id,scope_name,created_at)
    SELECT gen_random_uuid(),target.id,requested.scope_name,now() FROM target CROSS JOIN requested JOIN catalog ON catalog.name=requested.scope_name
    RETURNING id
  ), revoked_access AS (
    UPDATE public.access_tokens SET revoked_at=now() WHERE oauth_client_id=${input.id}::uuid AND revoked_at IS NULL RETURNING id
  ), revoked_refresh AS (
    UPDATE public.refresh_tokens SET revoked_at=now() WHERE oauth_client_id=${input.id}::uuid AND revoked_at IS NULL RETURNING id
  ), audited AS (
    INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at)
    SELECT gen_random_uuid(),${user.id}::uuid,${organization.id}::uuid,'oauth_client.scopes.updated','oauth_client',${input.id}::text,jsonb_build_object('client_id',${client[0].client_id},'environment',${client[0].environment},'scopes',${scopeList},'tokens_revoked',true),now() FROM target RETURNING id
  ) SELECT count(*)::int AS count FROM inserted`.returnsRow({count:"pg/int4@1"}).build());
  return {success:true,scopes};
}
