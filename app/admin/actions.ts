"use server";

import { randomUUID } from "node:crypto";
import { isAdminUser, requireAdminUser } from "@/src/lib/auth/admin";
import { db } from "@/src/prisma/db";

export type AdminUserItem = {
  id: string; displayName: string | null; username: string | null; avatarUrl: string | null;
  status: string; createdAt: string;
};
export type AdminSessionItem = {
  id: string; userId: string; displayName: string | null;
  createdAt: string; lastSeenAt: string; expiresAt: string; ipAddress: string | null;
  userAgent: string | null; isActive: boolean;
};
export type AdminClientItem = {
  id: string; clientId: string; name: string; description: string | null;
  clientType: string; isActive: boolean; createdAt: string;
};
export type AdminEventItem = {
  id: string; eventType: string; occurredAt: string; displayName: string | null; username: string | null;
  ipAddress: string | null; userAgent: string | null; metadata: Record<string, unknown> | null;
};
export type AdminManagementData = {
  users: AdminUserItem[]; sessions: AdminSessionItem[];
  clients: AdminClientItem[]; events: AdminEventItem[];
};

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : new Date().toISOString();
}

export async function getAdminManagementData(): Promise<AdminManagementData> {
  await requireAdminUser();
  const [userRows, sessionRows, clientRows, eventRows] = await Promise.all([
    db.runtime().query(db.raw.sql`SELECT u.id,
      p.display_name AS "displayName", p.username, p.avatar_url AS "avatarUrl", u.status, u.created_at AS "createdAt"
      FROM public.users u
      LEFT JOIN public.profiles p ON p.user_id = u.id
      WHERE u.status <> 'DELETED' ORDER BY u.created_at DESC`.returnsRow({
        id: "pg/uuid@1", displayName: "pg/text@1", username: "pg/text@1", avatarUrl: "pg/text@1",
        status: "pg/text@1", createdAt: "pg/timestamptz-date@1",
      }).build()),
    db.runtime().query(db.raw.sql`SELECT s.id, s.user_id AS "userId",
      p.display_name AS "displayName",
      s.created_at AS "createdAt", s.last_seen_at AS "lastSeenAt",
      s.expires_at AS "expiresAt", s.ip_address AS "ipAddress", s.user_agent AS "userAgent",
      (s.revoked_at IS NULL AND s.expires_at > now()) AS "isActive"
      FROM public.sessions s
      LEFT JOIN public.profiles p ON p.user_id = s.user_id
      ORDER BY s.last_seen_at DESC`.returnsRow({
        id: "pg/uuid@1", userId: "pg/uuid@1", displayName: "pg/text@1",
        createdAt: "pg/timestamptz-date@1", lastSeenAt: "pg/timestamptz-date@1",
        expiresAt: "pg/timestamptz-date@1", ipAddress: "pg/text@1", userAgent: "pg/text@1",
        isActive: "pg/bool@1",
      }).build()),
    db.runtime().query(db.raw.sql`SELECT c.id, c.client_id AS "clientId", c.name,
      c.description, c.client_type AS "clientType", c.is_active AS "isActive",
      c.created_at AS "createdAt"
      FROM public.oauth_clients c
      WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC`.returnsRow({
        id: "pg/uuid@1", clientId: "pg/text@1", name: "pg/text@1", description: "pg/text@1",
        clientType: "pg/text@1", isActive: "pg/bool@1", createdAt: "pg/timestamptz-date@1",
        }).build()),
    db.runtime().query(db.raw.sql`SELECT ev.id, ev.event_type AS "eventType",
      ev.occurred_at AS "occurredAt", p.display_name AS "displayName", p.username,
      ev.ip_address AS "ipAddress", ev.user_agent AS "userAgent", ev.metadata
      FROM public.security_events ev
      LEFT JOIN public.profiles p ON p.user_id = ev.user_id
      ORDER BY ev.occurred_at DESC`.returnsRow({
        id: "pg/uuid@1", eventType: "pg/text@1", occurredAt: "pg/timestamptz-date@1",
        displayName: "pg/text@1", username: "pg/text@1", ipAddress: "pg/text@1", userAgent: "pg/text@1", metadata: "pg/jsonb@1",
      }).build()),
  ]);
  return {
    users: userRows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })) as AdminUserItem[],
    sessions: sessionRows.map((r) => ({ ...r, createdAt: iso(r.createdAt), lastSeenAt: iso(r.lastSeenAt), expiresAt: iso(r.expiresAt) })) as AdminSessionItem[],
    clients: clientRows.map((r) => ({ ...r, createdAt: iso(r.createdAt) })) as AdminClientItem[],
    events: eventRows.map((r) => ({ ...r, occurredAt: iso(r.occurredAt), metadata: r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata) ? r.metadata as Record<string, unknown> : null })) as AdminEventItem[],
  };
}

export async function setAdminUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED") {
  const admin = await requireAdminUser();
  if (status !== "ACTIVE" && status !== "SUSPENDED") throw new Error("INVALID_USER_STATUS");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("INVALID_USER_ID");
  if (userId === admin.id) throw new Error("CANNOT_CHANGE_OWN_STATUS");
  const targetRows = await db.runtime().query(db.raw.sql`SELECT e.normalized_email AS email
    FROM public.users u
    LEFT JOIN public.email_addresses e ON e.user_id = u.id AND e.is_primary = true
    WHERE u.id = ${userId}::uuid AND u.status <> 'DELETED'
    LIMIT 1`.returnsRow({ email: "pg/text@1" }).build());
  if (!targetRows.length) throw new Error("USER_NOT_FOUND");
  if (targetRows[0].email && isAdminUser({ email: targetRows[0].email })) {
    throw new Error("CANNOT_CHANGE_ADMIN_STATUS");
  }
  const result = await db.runtime().query(db.raw.sql`UPDATE public.users
    SET status = ${status}, updated_at = now()
    WHERE id = ${userId}::uuid AND status <> 'DELETED'
    RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  if (!result.length) throw new Error("USER_NOT_FOUND");
  if (status === "SUSPENDED") {
    await db.runtime().query(db.raw.sql`UPDATE public.sessions SET revoked_at = now()
      WHERE user_id = ${userId}::uuid AND revoked_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
    await db.runtime().query(db.raw.sql`UPDATE public.access_tokens SET revoked_at = now()
      WHERE user_id = ${userId}::uuid AND revoked_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
    await db.runtime().query(db.raw.sql`UPDATE public.refresh_tokens SET revoked_at = now()
      WHERE user_id = ${userId}::uuid AND revoked_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
    await db.runtime().query(db.raw.sql`UPDATE public.oauth_consents SET status = 'REVOKED', revoked_at = now()
      WHERE user_id = ${userId}::uuid AND status = 'ACTIVE' RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  }
  return { success: true };
}

export async function revokeAdminSession(sessionId: string) {
  await requireAdminUser();
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("INVALID_SESSION_ID");
  const result = await db.runtime().query(db.raw.sql`UPDATE public.sessions
    SET revoked_at = now() WHERE id = ${sessionId}::uuid
    AND revoked_at IS NULL AND expires_at > now() RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  if (!result.length) throw new Error("SESSION_NOT_ACTIVE");
  await db.runtime().query(db.raw.sql`UPDATE public.access_tokens SET revoked_at = now()
    WHERE session_id = ${sessionId}::uuid AND revoked_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  await db.runtime().query(db.raw.sql`UPDATE public.refresh_tokens SET revoked_at = now()
    WHERE session_id = ${sessionId}::uuid AND revoked_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  return { success: true };
}

export async function setAdminOAuthClientStatus(clientDbId: string, isActive: boolean) {
  await requireAdminUser();
  if (typeof isActive !== "boolean") throw new Error("INVALID_CLIENT_STATUS");
  if (!/^[0-9a-f-]{36}$/i.test(clientDbId)) throw new Error("INVALID_CLIENT_ID");
  const result = await db.runtime().query(db.raw.sql`UPDATE public.oauth_clients
    SET is_active = ${isActive}, updated_at = now()
    WHERE id = ${clientDbId}::uuid AND deleted_at IS NULL RETURNING id`
    .returnsRow({ id: "pg/uuid@1" }).build());
  if (!result.length) throw new Error("OAUTH_CLIENT_NOT_FOUND");
  return { success: true };
}


export async function deleteAdminUser(userId: string) {
  const admin = await requireAdminUser();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("INVALID_USER_ID");
  if (userId === admin.id) throw new Error("CANNOT_DELETE_OWN_ACCOUNT");
  const target = await db.runtime().query(db.raw.sql`SELECT e.normalized_email AS email
    FROM public.users u LEFT JOIN public.email_addresses e
      ON e.user_id = u.id AND e.is_primary = true
    WHERE u.id = ${userId}::uuid AND u.status <> 'DELETED' LIMIT 1`
    .returnsRow({ email: "pg/text@1" }).build());
  if (!target.length) throw new Error("USER_NOT_FOUND");
  if (target[0].email && isAdminUser({ email: target[0].email })) throw new Error("CANNOT_DELETE_ADMIN");
  await db.runtime().query(db.raw.sql`UPDATE public.users SET status = 'DELETED',
    deleted_at = now(), updated_at = now() WHERE id = ${userId}::uuid AND status <> 'DELETED'
    RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  await db.runtime().query(db.raw.sql`UPDATE public.sessions SET revoked_at = now()
    WHERE user_id = ${userId}::uuid AND revoked_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  await db.runtime().query(db.raw.sql`UPDATE public.access_tokens SET revoked_at = now()
    WHERE user_id = ${userId}::uuid AND revoked_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  await db.runtime().query(db.raw.sql`UPDATE public.refresh_tokens SET revoked_at = now()
    WHERE user_id = ${userId}::uuid AND revoked_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  await db.runtime().query(db.raw.sql`UPDATE public.oauth_consents SET status = 'REVOKED', revoked_at = now()
    WHERE user_id = ${userId}::uuid AND status = 'ACTIVE' RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  return { success: true };
}

export async function bulkAdminUserAction(userIds: string[], action: "SUSPENDED" | "ACTIVE" | "DELETED") {
  await requireAdminUser();
  if (!Array.isArray(userIds) || !["ACTIVE", "SUSPENDED", "DELETED"].includes(action)) throw new Error("INVALID_BULK_ACTION");
  const uniqueIds = [...new Set(userIds)];
  if (!uniqueIds.length || uniqueIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("INVALID_USER_SELECTION");
  const outcomes = await Promise.allSettled(uniqueIds.map((id) =>
    action === "DELETED" ? deleteAdminUser(id) : setAdminUserStatus(id, action),
  ));
  return { successCount: outcomes.filter((result) => result.status === "fulfilled").length,
    failureCount: outcomes.filter((result) => result.status === "rejected").length };
}

export async function sendAdminNotification(input: { userIds: string[]; title: string; body: string }) {
  await requireAdminUser();
  if (!input || typeof input.title !== "string" || typeof input.body !== "string" || !Array.isArray(input.userIds)) throw new Error("INVALID_NOTIFICATION");
  const title = input.title.trim();
  const body = input.body.trim();
  const userIds = [...new Set(input.userIds)];
  if (!title || title.length > 120) throw new Error("TITLE_REQUIRED_MAX_120_CHARACTERS");
  if (body.length > 2000) throw new Error("MESSAGE_MAX_2000_CHARACTERS");
  if (!userIds.length || userIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("SELECT_AT_LEAST_ONE_VALID_USER");
  let sentCount = 0;
  for (const userId of userIds) {
    const eligible = await db.runtime().query(db.raw.sql`SELECT id FROM public.users
      WHERE id = ${userId}::uuid AND status <> 'DELETED' LIMIT 1`
      .returnsRow({ id: "pg/uuid@1" }).build());
    if (!eligible.length) continue;
    await db.runtime().query(db.raw.sql`INSERT INTO public.security_notifications
      (id, user_id, title, body, type, metadata, created_at)
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${title}, ${body}, 'SECURITY_ALERT',
        jsonb_build_object('source', 'admin_console'), now()) RETURNING id`
      .returnsRow({ id: "pg/uuid@1" }).build());
    sentCount += 1;
  }
  if (!sentCount) throw new Error("NO_ELIGIBLE_USERS");
  return { sentCount };
}

export type AdminRoleItem = { id: string; name: string; description: string | null; roleType: string; isSystem: boolean; organizationId: string | null; organizationName: string | null };
export type AdminRoleUserItem = { userId: string; displayName: string | null; username: string | null; avatarUrl: string | null; status: string; roleIds: string; roleNames: string };

export async function getAdminRoleData(): Promise<{ roles: AdminRoleItem[]; users: AdminRoleUserItem[] }> {
  await requireAdminUser();
  const [roles, users] = await Promise.all([
    db.runtime().query(db.raw.sql`SELECT r.id, r.name, r.description, r.role_type AS "roleType",
      r.is_system AS "isSystem", r.organization_id AS "organizationId", o.name AS "organizationName"
      FROM public.roles r LEFT JOIN public.organizations o ON o.id = r.organization_id
      ORDER BY r.role_type, o.name, r.name`.returnsRow({
        id: "pg/uuid@1", name: "pg/text@1", description: "pg/text@1", roleType: "pg/text@1",
        isSystem: "pg/bool@1", organizationId: "pg/uuid@1", organizationName: "pg/text@1",
      }).build()),
    db.runtime().query(db.raw.sql`SELECT u.id AS "userId", p.display_name AS "displayName", p.username,
      p.avatar_url AS "avatarUrl", u.status,
      COALESCE(string_agg(r.id::text, ',') FILTER (WHERE r.id IS NOT NULL), '') AS "roleIds",
      COALESCE(string_agg(r.name, ', ' ORDER BY r.name) FILTER (WHERE r.id IS NOT NULL), '') AS "roleNames"
      FROM public.users u LEFT JOIN public.profiles p ON p.user_id = u.id
      LEFT JOIN public.user_roles ur ON ur.user_id = u.id
      LEFT JOIN public.roles r ON r.id = ur.role_id
      WHERE u.status <> 'DELETED'
      GROUP BY u.id, p.display_name, p.username, p.avatar_url, u.status
      ORDER BY p.display_name NULLS LAST, p.username NULLS LAST, u.created_at DESC`.returnsRow({
        userId: "pg/uuid@1", displayName: "pg/text@1", username: "pg/text@1", avatarUrl: "pg/text@1",
        status: "pg/text@1", roleIds: "pg/text@1", roleNames: "pg/text@1",
      }).build()),
  ]);
  return { roles: roles as AdminRoleItem[], users: users as AdminRoleUserItem[] };
}

export async function assignAdminUserRole(userId: string, roleId: string, assign: boolean) {
  const admin = await requireAdminUser();
  if (typeof assign !== "boolean") throw new Error("INVALID_ROLE_ASSIGNMENT");
  for (const id of [userId, roleId]) if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("INVALID_ROLE_ASSIGNMENT");
  const user = await db.runtime().query(db.raw.sql`SELECT id FROM public.users
    WHERE id = ${userId}::uuid AND status <> 'DELETED' LIMIT 1`
    .returnsRow({ id: "pg/uuid@1" }).build());
  const role = await db.runtime().query(db.raw.sql`SELECT id FROM public.roles
    WHERE id = ${roleId}::uuid AND role_type = 'ORGANIZATION' AND is_system = false LIMIT 1`
    .returnsRow({ id: "pg/uuid@1" }).build());
  if (!user.length || !role.length) throw new Error("ROLE_OR_USER_NOT_FOUND");
  if (assign) {
    await db.runtime().query(db.raw.sql`INSERT INTO public.user_roles
      (id, user_id, role_id, assigned_by_id, assigned_at)
      VALUES (${randomUUID()}::uuid, ${userId}::uuid, ${roleId}::uuid, ${admin.id}::uuid, now())
      ON CONFLICT (user_id, role_id) DO NOTHING RETURNING id`
      .returnsRow({ id: "pg/uuid@1" }).build());
  } else {
    await db.runtime().query(db.raw.sql`DELETE FROM public.user_roles
      WHERE user_id = ${userId}::uuid AND role_id = ${roleId}::uuid RETURNING id`
      .returnsRow({ id: "pg/uuid@1" }).build());
  }
  return { success: true };
}

export async function createAdminRole(input: { name: string; description: string }) {
  await requireAdminUser();
  if (!input || typeof input.name !== "string" || typeof input.description !== "string") throw new Error("INVALID_ROLE");
  const name = input.name.trim();
  const description = input.description.trim();
  if (!name || name.length > 80) throw new Error("ROLE_NAME_REQUIRED_MAX_80_CHARACTERS");
  if (description.length > 300) throw new Error("DESCRIPTION_MAX_300_CHARACTERS");
  const id = randomUUID();
  await db.runtime().query(db.raw.sql`INSERT INTO public.roles
    (id, name, description, role_type, organization_id, is_system, created_at, updated_at)
    VALUES (${id}::uuid, ${name}, NULLIF(${description}, ''), 'ORGANIZATION', NULL, false, now(), now())
    RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  return { success: true, id };
}

export async function getAdminOrganizations() {
  await requireAdminUser();
  return await db.runtime().query(db.raw.sql`SELECT id, name FROM public.organizations WHERE status = 'ACTIVE' ORDER BY name`
    .returnsRow({ id: "pg/uuid@1", name: "pg/text@1" }).build()) as Array<{id: string; name: string}>;
}

export type AdminUserDetails = {
  id: string; displayName: string | null; username: string | null; avatarUrl: string | null;
  locale: string | null; timeZone: string | null; status: string; createdAt: string;
  updatedAt: string; lastLoginAt: string | null; emailVerified: boolean;
  passkeyCount: number; totpEnabled: boolean; recoveryCodesRemaining: number;
  activeSessions: number; organizationMemberships: Array<{ name: string; status: string; roles: string[] }>;
};

export async function getAdminUserDetails(userId: string): Promise<AdminUserDetails> {
  await requireAdminUser();
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("INVALID_USER_ID");
  const rows = await db.runtime().query(db.raw.sql`SELECT u.id, u.status, u.created_at AS "createdAt",
    u.updated_at AS "updatedAt", u.last_login_at AS "lastLoginAt",
    p.display_name AS "displayName", p.username, p.avatar_url AS "avatarUrl",
    p.locale, p.time_zone AS "timeZone",
    EXISTS(SELECT 1 FROM public.email_addresses e WHERE e.user_id = u.id AND e.verified_at IS NOT NULL) AS "emailVerified",
    (SELECT count(*)::int4 FROM public.passkey_credentials pc WHERE pc.user_id = u.id) AS "passkeyCount",
    EXISTS(SELECT 1 FROM public.totp_credentials tc WHERE tc.user_id = u.id AND tc.is_enabled = true) AS "totpEnabled",
    (SELECT count(*)::int4 FROM public.recovery_codes rc WHERE rc.user_id = u.id AND rc.used_at IS NULL) AS "recoveryCodesRemaining",
    (SELECT count(*)::int4 FROM public.sessions se WHERE se.user_id = u.id AND se.revoked_at IS NULL AND se.expires_at > now()) AS "activeSessions"
    FROM public.users u LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.id = ${userId}::uuid LIMIT 1`.returnsRow({
      id: "pg/uuid@1", status: "pg/text@1", createdAt: "pg/timestamptz-date@1",
      updatedAt: "pg/timestamptz-date@1", lastLoginAt: "pg/timestamptz-date@1",
      displayName: "pg/text@1", username: "pg/text@1", avatarUrl: "pg/text@1",
      locale: "pg/text@1", timeZone: "pg/text@1", emailVerified: "pg/bool@1",
      passkeyCount: "pg/int4@1", totpEnabled: "pg/bool@1",
      recoveryCodesRemaining: "pg/int4@1", activeSessions: "pg/int4@1",
    }).build());
  if (!rows.length) throw new Error("USER_NOT_FOUND");
  const memberships = await db.runtime().query(db.raw.sql`SELECT o.name, m.status,
    COALESCE(string_agg(r.name, ', '), '') AS roles
    FROM public.organization_memberships m
    JOIN public.organizations o ON o.id = m.organization_id
    LEFT JOIN public.membership_roles mr ON mr.membership_id = m.id
    LEFT JOIN public.roles r ON r.id = mr.role_id
    WHERE m.user_id = ${userId}::uuid
    GROUP BY o.name, m.status ORDER BY o.name`.returnsRow({
      name: "pg/text@1", status: "pg/text@1", roles: "pg/text@1",
    }).build());
  const r = rows[0];
  return {
    ...r,
    createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt),
    lastLoginAt: r.lastLoginAt ? iso(r.lastLoginAt) : null,
    organizationMemberships: memberships.map((m) => ({ ...m, roles: m.roles ? m.roles.split(", ") : [] })),
  } as AdminUserDetails;
}

export async function updateAdminUserProfile(input: {
  userId: string; displayName: string; username: string; avatarUrl: string; locale: string; timeZone: string;
}) {
  await requireAdminUser();
  if (!/^[0-9a-f-]{36}$/i.test(input.userId)) throw new Error("INVALID_USER_ID");
  const displayName = input.displayName.trim();
  const username = input.username.trim().toLowerCase();
  const avatarUrl = input.avatarUrl.trim();
  const locale = input.locale.trim();
  const timeZone = input.timeZone.trim();
  if (displayName.length > 100 || username.length > 40 || locale.length > 20 || timeZone.length > 80) throw new Error("PROFILE_FIELD_TOO_LONG");
  if (username && !/^[a-z0-9_]{3,40}$/.test(username)) throw new Error("USERNAME_FORMAT_INVALID");
  if (avatarUrl && (!/^https:\/\//i.test(avatarUrl) || avatarUrl.length > 1000)) throw new Error("AVATAR_MUST_BE_HTTPS_URL");
  const exists = await db.runtime().query(db.raw.sql`SELECT id FROM public.users WHERE id = ${input.userId}::uuid AND status <> 'DELETED' LIMIT 1`.returnsRow({ id: "pg/uuid@1" }).build());
  if (!exists.length) throw new Error("USER_NOT_FOUND");
  const profile = await db.runtime().query(db.raw.sql`SELECT id FROM public.profiles WHERE user_id = ${input.userId}::uuid LIMIT 1`.returnsRow({ id: "pg/uuid@1" }).build());
  if (profile.length) {
    await db.runtime().query(db.raw.sql`UPDATE public.profiles SET display_name = NULLIF(${displayName}, ''),
      username = NULLIF(${username}, ''), normalized_username = NULLIF(${username}, ''),
      avatar_url = NULLIF(${avatarUrl}, ''), locale = NULLIF(${locale}, ''),
      time_zone = NULLIF(${timeZone}, ''), updated_at = now()
      WHERE user_id = ${input.userId}::uuid RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  } else {
    await db.runtime().query(db.raw.sql`INSERT INTO public.profiles
      (id, user_id, display_name, username, normalized_username, avatar_url, locale, time_zone, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${input.userId}::uuid, NULLIF(${displayName}, ''),
      NULLIF(${username}, ''), NULLIF(${username}, ''), NULLIF(${avatarUrl}, ''),
      NULLIF(${locale}, ''), NULLIF(${timeZone}, ''), now(), now()) RETURNING id`
      .returnsRow({ id: "pg/uuid@1" }).build());
  }
  return { success: true };
}


/** Move all active Agent hostname assignments onto the configured shared tunnel. */
export async function migrateAgentTunnelsToSharedGateway() {
  await requireAdminUser();
  const sharedTunnelId = "05da5c33-2dfa-4473-b576-d3b2fb28754f";

  // Remove the old one-tunnel-per-user uniqueness rule; multiple users now
  // legitimately share one tunnel while each hostname remains unique.
  await db.runtime().query(db.raw.sql`
    ALTER TABLE public.agent_tunnels DROP CONSTRAINT IF EXISTS agent_tunnels_tunnel_id_key
  `.returnsRow({ ok: "pg/bool@1" }).build());
  await db.runtime().query(db.raw.sql`
    DROP INDEX IF EXISTS public.agent_tunnels_tunnel_id_key
  `.returnsRow({ ok: "pg/bool@1" }).build());

  const migrated = await db.runtime().query(db.raw.sql`
    UPDATE public.agent_tunnels
    SET tunnel_id=${sharedTunnelId}, updated_at=now()
    WHERE status='ACTIVE' AND tunnel_id <> ${sharedTunnelId}
    RETURNING id
  `.returnsRow({ id: "pg/uuid@1" }).build());

  await db.runtime().query(db.raw.sql`
    CREATE INDEX IF NOT EXISTS agent_tunnels_shared_tunnel_idx
    ON public.agent_tunnels(tunnel_id) WHERE status='ACTIVE'
  `.returnsRow({ ok: "pg/bool@1" }).build());

  const remaining = await db.runtime().query(db.raw.sql`
    SELECT count(*)::int4 AS count FROM public.agent_tunnels
    WHERE status='ACTIVE' AND tunnel_id <> ${sharedTunnelId}
  `.returnsRow({ count: "pg/int4@1" }).build());
  if (remaining[0]?.count !== 0) throw new Error("AGENT_TUNNEL_MIGRATION_VERIFICATION_FAILED");

  return { success: true, migratedCount: migrated.length, sharedTunnelId };
}
