import "server-only";

import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/src/lib/auth/session";
import { db } from "@/src/prisma/db";
import type { StoredAccount } from "@/src/lib/auth/account-store";

export type OneAuthRole = "ADMIN" | "USER";

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.ONEAUTH_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Environment allowlist is retained as a bootstrap/recovery path so the first
 * administrator can enter the console and assign the database-backed Admin role.
 * All other access is based on a direct assignment of the "Admin" role.
 */
export function isAdminUser(user: Pick<StoredAccount, "email">): boolean {
  return configuredAdminEmails().has(user.email.trim().toLowerCase());
}

export async function hasDatabaseAdminRole(userId: string): Promise<boolean> {
  const rows = await db.runtime().query(db.raw.sql`SELECT 1 AS allowed
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${userId}::uuid
      AND lower(trim(r.name)) = 'admin'
      AND r.is_system = false
    LIMIT 1`.returnsRow({ allowed: "pg/int4@1" }).build());
  return rows.length > 0;
}

export async function getOneAuthRole(email: string, userId?: string): Promise<OneAuthRole> {
  if (configuredAdminEmails().has(email.trim().toLowerCase())) return "ADMIN";
  return userId && await hasDatabaseAdminRole(userId) ? "ADMIN" : "USER";
}

export async function requireAdminUser(): Promise<StoredAccount> {
  const user = await requireCurrentUser();
  if (await getOneAuthRole(user.email, user.id) !== "ADMIN") redirect("/dashboard");
  return user;
}
