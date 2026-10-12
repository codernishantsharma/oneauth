"use server";


import { requireDeveloperOrganization } from "../access";
import { db } from "@/src/prisma/db";

export type DeveloperAuditEvent = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  occurredAt: string;
  actorEmail: string | null;
  metadata: unknown;
};

export async function getDeveloperAuditLogs(): Promise<DeveloperAuditEvent[]> {
  const { organization } = await requireDeveloperOrganization();
  const rows = await db.runtime().query(db.raw.sql`SELECT a.id, a.action, a.resource_type AS "resourceType", a.resource_id AS "resourceId", a.occurred_at::text AS "occurredAt", ea.normalized_email AS "actorEmail", a.metadata FROM public.audit_logs a LEFT JOIN public.email_addresses ea ON ea.user_id=a.actor_user_id AND ea.is_primary=true WHERE a.organization_id=${organization.id}::uuid ORDER BY a.occurred_at DESC LIMIT 100`.returnsRow({
    id: "pg/uuid@1",
    action: "pg/text@1",
    resourceType: "pg/text@1",
    resourceId: "pg/text@1",
    occurredAt: "pg/text@1",
    actorEmail: "pg/text@1",
    metadata: "pg/jsonb@1"
  }).build());
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    occurredAt: row.occurredAt,
    actorEmail: row.actorEmail,
    metadata: row.metadata
  }));
}
