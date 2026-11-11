"use server";

import { requireCurrentUser } from "@/src/lib/auth/session";
import { db } from "@/src/prisma/db";

export type UserNotification = {
  id: string; title: string; body: string | null; type: string; readAt: string | null; createdAt: string;
};

export async function getMyNotifications(): Promise<UserNotification[]> {
  const user = await requireCurrentUser();
  const rows = await db.runtime().query(db.raw.sql`SELECT id, title, body, type,
    read_at AS "readAt", created_at AS "createdAt"
    FROM public.security_notifications WHERE user_id = ${user.id}::uuid
    ORDER BY created_at DESC LIMIT 200`.returnsRow({
      id: "pg/uuid@1", title: "pg/text@1", body: "pg/text@1", type: "pg/text@1",
      readAt: "pg/timestamptz-date@1", createdAt: "pg/timestamptz-date@1",
    }).build());
  return rows.map((row) => ({
    ...row,
    readAt: row.readAt ? (row.readAt instanceof Date ? row.readAt.toISOString() : String(row.readAt)) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  })) as UserNotification[];
}

export async function markMyNotificationRead(notificationId: string) {
  const user = await requireCurrentUser();
  if (!/^[0-9a-f-]{36}$/i.test(notificationId)) throw new Error("INVALID_NOTIFICATION_ID");
  await db.runtime().query(db.raw.sql`UPDATE public.security_notifications SET read_at = COALESCE(read_at, now())
    WHERE id = ${notificationId}::uuid AND user_id = ${user.id}::uuid RETURNING id`
    .returnsRow({ id: "pg/uuid@1" }).build());
  return { success: true };
}
