import { db } from "@/src/prisma/db";
import { isSupportedClientAuthMethod } from "./validation";

export { hashOpaqueToken, randomOpaqueToken, safeEqual, createPkceChallenge } from "./crypto";

export type OAuthClient = {
  id:string; clientId:string; secretHash:string|null; clientType:string; authMethod:string;
  grantTypes:string[]; isActive:boolean; deleted:boolean; organizationId:string|null; name:string;
};

export function oauthError(error:string,status=400,description?:string) {
  return Response.json({error,...(description?{error_description:description}:{})},{status,headers:{"Cache-Control":"no-store",Pragma:"no-cache","Content-Type":"application/json; charset=utf-8"}});
}

export async function findClient(clientId:string):Promise<OAuthClient|null> {
  const rows=await db.runtime().query(db.raw.sql`SELECT c.id,c.client_id AS "clientId",c.client_secret_hash AS "secretHash",c.client_type AS "clientType",c.token_endpoint_auth_method AS "authMethod",array_to_string(c.grant_types, ',') AS "grantTypes",c.is_active AS "isActive",(c.deleted_at IS NOT NULL) AS deleted,c.organization_id AS "organizationId",c.name,o.status AS "organizationStatus",o.deleted_at AS "organizationDeleted" FROM public.oauth_clients c LEFT JOIN public.organizations o ON o.id=c.organization_id WHERE c.client_id=${clientId} LIMIT 1`.returnsRow({
    id:"pg/uuid@1",clientId:"pg/text@1",secretHash:"pg/text@1",clientType:"pg/text@1",authMethod:"pg/text@1",grantTypes:"pg/text@1",isActive:"pg/bool@1",deleted:"pg/bool@1",organizationId:"pg/text@1",name:"pg/text@1",organizationStatus:"pg/text@1",organizationDeleted:"pg/timestamptz-string@1"
  }).build());
  const row=rows[0];
  if(!row||!row.isActive||row.deleted||!isSupportedClientAuthMethod(row.authMethod)||(row.organizationId&&(row.organizationStatus!=="ACTIVE"||row.organizationDeleted))) return null;
  return {...row,grantTypes:row.grantTypes?row.grantTypes.split(","):[],organizationId:row.organizationId||null} as OAuthClient;
}

export async function getClientScopes(clientDbId:string):Promise<string[]> {
  const rows=await db.runtime().query(db.raw.sql`SELECT scope_name AS name FROM public.oauth_client_scopes WHERE oauth_client_id=${clientDbId}::uuid ORDER BY scope_name`.returnsRow({name:"pg/text@1"}).build());
  return rows.map(row=>row.name);
}

export async function validRedirectUri(clientId:string,redirectUri:string) {
  const rows=await db.runtime().query(db.raw.sql`SELECT 1 AS ok FROM public.oauth_redirect_uris r JOIN public.oauth_clients c ON c.id=r.oauth_client_id LEFT JOIN public.organizations o ON o.id=c.organization_id WHERE c.client_id=${clientId} AND c.is_active=true AND c.deleted_at IS NULL AND r.uri=${redirectUri} AND (c.organization_id IS NULL OR (o.status='ACTIVE' AND o.deleted_at IS NULL)) LIMIT 1`.returnsRow({ok:"pg/int4@1"}).build());
  return rows.length>0;
}
