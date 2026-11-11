"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/src/lib/auth/session";
import { writeSecurityEvent } from "@/src/lib/auth/security-events";
import { db } from "@/src/prisma/db";

export type EditableProfile = {
  email: string;
  emailVerified: boolean;
  displayName: string;
  username: string;
  avatarUrl: string;
  locale: string;
  timeZone: string;
  createdAt: string;
};

export async function getMyProfile(): Promise<EditableProfile> {
  const user = await requireCurrentUser();
  const rows = await db.runtime().query(db.raw.sql`
    SELECT u.created_at AS "createdAt", e.normalized_email AS email,
      (e.verified_at IS NOT NULL) AS "emailVerified",
      p.display_name AS "displayName", p.username,
      p.avatar_url AS "avatarUrl", p.locale, p.time_zone AS "timeZone"
    FROM public.users u
    LEFT JOIN public.email_addresses e ON e.user_id = u.id AND e.is_primary = true
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.id = ${user.id}::uuid AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
    LIMIT 1
  `.returnsRow({
    createdAt: "pg/timestamptz-string@1", email: "pg/text@1", emailVerified: "pg/bool@1",
    displayName: "pg/text@1", username: "pg/text@1", avatarUrl: "pg/text@1",
    locale: "pg/text@1", timeZone: "pg/text@1",
  }).build());
  const row = rows[0];
  if (!row) throw new Error("PROFILE_NOT_FOUND");
  return {
    email: row.email ?? user.email,
    emailVerified: Boolean(row.emailVerified),
    displayName: row.displayName ?? "",
    username: row.username ?? "",
    avatarUrl: row.avatarUrl ?? "",
    locale: row.locale ?? "en",
    timeZone: row.timeZone ?? "UTC",
    createdAt: String(row.createdAt),
  };
}

export async function updateMyAvatar(avatarUrlInput: string): Promise<{ success: true }> {
  const user = await requireCurrentUser();
  const avatarUrl = avatarUrlInput.trim();
  if (!/^https:\/\//i.test(avatarUrl) || avatarUrl.length > 1000) throw new Error("AVATAR_MUST_BE_HTTPS_URL");
  const existing = await db.runtime().query(db.raw.sql`
    SELECT id FROM public.profiles WHERE user_id = ${user.id}::uuid LIMIT 1
  `.returnsRow({ id: "pg/uuid@1" }).build());
  if (existing.length) {
    await db.runtime().query(db.raw.sql`
      UPDATE public.profiles SET avatar_url = ${avatarUrl}, updated_at = now()
      WHERE user_id = ${user.id}::uuid RETURNING id
    `.returnsRow({ id: "pg/uuid@1" }).build());
  } else {
    await db.runtime().query(db.raw.sql`
      INSERT INTO public.profiles (id, user_id, avatar_url, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${user.id}::uuid, ${avatarUrl}, now(), now()) RETURNING id
    `.returnsRow({ id: "pg/uuid@1" }).build());
  }
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/apps");
  return { success: true };
}

export async function updateMyProfile(input: {
  displayName: string;
  username: string;
  avatarUrl: string;
  locale: string;
  timeZone: string;
}): Promise<{ success: true }> {
  const user = await requireCurrentUser();
  const displayName = input.displayName.trim();
  const username = input.username.trim().toLowerCase();
  const avatarUrl = input.avatarUrl.trim();
  const locale = input.locale.trim();
  const timeZone = input.timeZone.trim();

  if (displayName.length > 100) throw new Error("DISPLAY_NAME_TOO_LONG");
  if (username && !/^[a-z0-9_]{3,40}$/.test(username)) throw new Error("USERNAME_FORMAT_INVALID");
  if (avatarUrl && (!/^https:\/\//i.test(avatarUrl) || avatarUrl.length > 1000)) throw new Error("AVATAR_MUST_BE_HTTPS_URL");
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(locale) || locale.length > 12) throw new Error("LOCALE_INVALID");
  if (timeZone.length > 80 || !timeZone) throw new Error("TIME_ZONE_INVALID");
  try { new Intl.DateTimeFormat("en", { timeZone }).format(); } catch { throw new Error("TIME_ZONE_INVALID"); }

  if (username) {
    const collision = await db.runtime().query(db.raw.sql`
      SELECT user_id AS "userId" FROM public.profiles
      WHERE normalized_username = ${username} AND user_id <> ${user.id}::uuid LIMIT 1
    `.returnsRow({ userId: "pg/uuid@1" }).build());
    if (collision.length) throw new Error("USERNAME_EXISTS");
  }

  const existing = await db.runtime().query(db.raw.sql`
    SELECT id FROM public.profiles WHERE user_id = ${user.id}::uuid LIMIT 1
  `.returnsRow({ id: "pg/uuid@1" }).build());
  if (existing.length) {
    await db.runtime().query(db.raw.sql`
      UPDATE public.profiles SET display_name = NULLIF(${displayName}, ''),
        username = NULLIF(${username}, ''), normalized_username = NULLIF(${username}, ''),
        avatar_url = NULLIF(${avatarUrl}, ''), locale = NULLIF(${locale}, ''),
        time_zone = NULLIF(${timeZone}, ''), updated_at = now()
      WHERE user_id = ${user.id}::uuid RETURNING id
    `.returnsRow({ id: "pg/uuid@1" }).build());
  } else {
    await db.runtime().query(db.raw.sql`
      INSERT INTO public.profiles
        (id, user_id, display_name, username, normalized_username, avatar_url, locale, time_zone, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${user.id}::uuid, NULLIF(${displayName}, ''),
        NULLIF(${username}, ''), NULLIF(${username}, ''), NULLIF(${avatarUrl}, ''),
        NULLIF(${locale}, ''), NULLIF(${timeZone}, ''), now(), now()) RETURNING id
    `.returnsRow({ id: "pg/uuid@1" }).build());
  }

  await writeSecurityEvent({ userId: user.id, eventType: "PROFILE_UPDATED", metadata: { usernameChanged: username !== (user.username ?? "").toLowerCase() } });
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/apps");
  return { success: true };
}
