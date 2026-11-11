"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { requireDeveloperOrganization } from "./access";
import { db } from "@/src/prisma/db";

export async function rotateDeveloperClientSecret(clientId: string) {
  const { user, organization } = await requireDeveloperOrganization();
  if (typeof clientId !== "string" || !/^[0-9a-f-]{36}$/i.test(clientId)) throw new Error("Invalid application.");
  const clients = await db.runtime().query(db.raw.sql`SELECT id,client_id AS "clientId",client_type AS "clientType",token_endpoint_auth_method AS "authMethod" FROM public.oauth_clients WHERE id=${clientId}::uuid AND organization_id=${organization.id}::uuid AND deleted_at IS NULL AND is_active=true LIMIT 1`.returnsRow({
    id:"pg/uuid@1",clientId:"pg/text@1",clientType:"pg/text@1",authMethod:"pg/text@1"
  }).build());
  const client=clients[0];
  if(!client) throw new Error("Application not found or disabled.");
  if(!["WEB","SERVICE"].includes(client.clientType) || !["CLIENT_SECRET_POST","CLIENT_SECRET_BASIC"].includes(client.authMethod)) throw new Error("Public clients do not use client secrets.");
  const secret="oas_"+randomBytes(32).toString("base64url");
  const hash=createHash("sha256").update(secret).digest("hex");
  const changed=await db.runtime().query(db.raw.sql`UPDATE public.oauth_clients SET client_secret_hash=${hash},updated_at=now() WHERE id=${clientId}::uuid AND organization_id=${organization.id}::uuid AND is_active=true AND deleted_at IS NULL RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  if(!changed.length) throw new Error("Application changed during rotation. Try again.");
  await db.runtime().query(db.raw.sql`INSERT INTO public.audit_logs (id,actor_user_id,organization_id,action,resource_type,resource_id,metadata,occurred_at) VALUES (${randomUUID()}::uuid,${user.id}::uuid,${organization.id}::uuid,'oauth_client.secret.rotated','oauth_client',${clientId},jsonb_build_object('client_id',${client.clientId}),now()) RETURNING id`.returnsRow({id:"pg/uuid@1"}).build());
  return { secret };
}
