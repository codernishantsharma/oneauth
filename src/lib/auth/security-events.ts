import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/src/prisma/db";

export type SecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "SESSION_CREATED"
  | "SESSION_REVOKED"
  | "PASSKEY_ADDED"
  | "PASSKEY_REMOVED"
  | "PASSWORD_CHANGED"
  | "TOTP_ENABLED"
  | "TOTP_DISABLED"
  | "RECOVERY_CODE_USED"
  | "PROFILE_UPDATED"
  | "USERNAME_CHANGED";

type SecurityEventInput = {
  userId?: string | null;
  eventType: SecurityEventType;
  headers?: Headers;
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * Best-effort security event logging. Authentication should remain available
 * if the logging store is temporarily unavailable; failures are still reported
 * to server logs without including credentials or tokens.
 */
export async function writeSecurityEvent(input: SecurityEventInput): Promise<void> {
  const ipAddress =
    input.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    input.headers?.get("x-real-ip") ||
    null;
  const userAgent = input.headers?.get("user-agent") ?? null;
  const metadata = JSON.stringify(input.metadata ?? {});

  try {
    const query = db.raw.sql`INSERT INTO public.security_events
      (id, user_id, event_type, occurred_at, ip_address, user_agent, metadata)
      VALUES (
        ${randomUUID()}::uuid,
        NULLIF(${input.userId ?? ""}::text, '')::uuid,
        ${input.eventType}::public.security_event_type,
        now(),
        NULLIF(${ipAddress ?? ""}::text, ''),
        NULLIF(${userAgent ?? ""}::text, ''),
        ${metadata}::jsonb
      ) RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build();
    await db.runtime().query(query);
  } catch (error) {
    console.error("OneAuth security event could not be persisted:", {
      eventType: input.eventType,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export type SecurityEventListItem = {
  id: string;
  eventType: string;
  occurredAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
};

export async function listSecurityEventsForUser(userId: string, limit = 50): Promise<SecurityEventListItem[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const query = db.raw.sql`SELECT id, event_type AS "eventType",
      occurred_at AS "occurredAt", ip_address AS "ipAddress",
      user_agent AS "userAgent", metadata
    FROM public.security_events
    WHERE user_id = ${userId}::uuid
    ORDER BY occurred_at DESC
    LIMIT ${safeLimit}`.returnsRow({
      id: "pg/uuid@1",
      eventType: "pg/text@1",
      occurredAt: "pg/timestamptz-date@1",
      ipAddress: "pg/text@1",
      userAgent: "pg/text@1",
      metadata: "pg/jsonb@1",
    }).build();
  const rows = await db.runtime().query(query);
  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    occurredAt: row.occurredAt instanceof Date ? row.occurredAt.toISOString() : String(row.occurredAt),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : null,
  }));
}
