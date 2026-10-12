"use server";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { requireDeveloperOrganization } from "../access";
import { db } from "@/src/prisma/db";

export type DeveloperApiKey = { id:string; name:string; prefix:string; environment:"DEVELOPMENT"|"PRODUCTION"; scopes:string[]; createdAt:string; expiresAt:string|null; lastUsedAt:string|null; revokedAt:string|null };

export async function getDeveloperApiKeys(): Promise<DeveloperApiKey[]> {
  const { organization } = await requireDeveloperOrganization();
  const rows = await db.runtime().query(db.raw.sql`SELECT id,name,prefix,environment,array_to_string(scopes, ',') AS scopes,created_at AS "createdAt",expires_at AS "expiresAt",last_used_at AS "lastUsedAt",revoked_at AS "revokedAt" FROM public.api_keys WHERE organization_id=${organization.id}::uuid ORDER BY created_at DESC LIMIT 100`.returnsRow({id:"pg/uuid@1",name:"pg/text@1",prefix:"pg/text@1",environment:"pg/text@1",scopes:"pg/text@1",createdAt:"pg/timestamptz-string@1",expiresAt:"pg/timestamptz-string@1",lastUsedAt:"pg/timestamptz-string@1",revokedAt:"pg/timestamptz-string@1"}).build());
  return rows.map((row)=>({...row,environment:row.environment as "DEVELOPMENT"|"PRODUCTION",scopes:typeof row.scopes==="string"?row.scopes.split(",").filter(Boolean):[],createdAt:String(row.createdAt),expiresAt:row.expiresAt?String(row.expiresAt):null,lastUsedAt:row.lastUsedAt?String(row.lastUsedAt):null,revokedAt:row.revokedAt?String(row.revokedAt):null})) as DeveloperApiKey[];
}

export async function createDeveloperApiKey(input:{name:string;scopes:string[];expiresInDays:number|null;environment:"DEVELOPMENT"|"PRODUCTION"}) {
  const {user,organization}=await requireDeveloperOrganization();
  const name=typeof input?.name==="string"?input.name.trim():"";
  const allowedScopes=new Set(["users:read","users:write","oauth:read","oauth:write","mcp:connect"]);
  if(!name||name.length>80) throw new Error("Key name must be 1–80 characters.");
  if(!Array.isArray(input.scopes)||!input.scopes.length||input.scopes.some(scope=>!allowedScopes.has(scope))) throw new Error("Choose at least one valid scope.");
  if(!["DEVELOPMENT","PRODUCTION"].includes(input.environment)) throw new Error("Choose a valid environment.");
  const days=input.expiresInDays;
  if(days!==null&&(!Number.isInteger(days)||days<1||days>365)) throw new Error("Expiry must be between 1 and 365 days.");
  const raw=`oak_${randomBytes(32).toString("base64url")}`,prefix=raw.slice(0,12),hash=createHash("sha256").update(raw).digest("hex"),id=randomUUID();
  await db.runtime().query(db.raw.sql`INSERT INTO public.api_keys (id,name,prefix,secret_hash,scopes,organization_id,user_id,environment,created_at,expires_at) VALUES (${id}::uuid,${name},${prefix},${hash},string_to_array(${input.scopes.join(',')}, ','),${organization.id}::uuid,NULL,${input.environment},now(),CASE WHEN ${days??0}=0 THEN NULL ELSE now()+(${days??0}*interval '1 day') END) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  await db.runtime().query(db.raw.sql`INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at) VALUES (${randomUUID()}::uuid,${user.id}::uuid,${organization.id}::uuid,'api_key.created','api_key',${id}::text,jsonb_build_object('prefix',${prefix},'scopes',${input.scopes.join(',')},'environment',${input.environment}),now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  return {id,key:raw,prefix,environment:input.environment};
}

export async function revokeDeveloperApiKey(id:string) {
  const {user,organization}=await requireDeveloperOrganization();
  if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid API key.");
  const rows=await db.runtime().query(db.raw.sql`UPDATE public.api_keys SET revoked_at=now() WHERE id=${id}::uuid AND organization_id=${organization.id}::uuid AND revoked_at IS NULL RETURNING id,prefix,environment`.returnsRow({id:"pg/uuid@1",prefix:"pg/text@1",environment:"pg/text@1"}).build());
  if(!rows.length) throw new Error("API key not found or already revoked.");
  await db.runtime().query(db.raw.sql`INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at) VALUES (${randomUUID()}::uuid,${user.id}::uuid,${organization.id}::uuid,'api_key.revoked','api_key',${id}::text,jsonb_build_object('prefix',${rows[0].prefix},'environment',${rows[0].environment}),now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  return {success:true};
}
