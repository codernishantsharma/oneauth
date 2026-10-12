import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getUserFromSession, type StoredAccount } from "@/src/lib/auth/account-store";

export const SESSION_COOKIE_NAME = "oneauth_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export async function getCurrentUser(): Promise<StoredAccount | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;
  return getUserFromSession(sessionId);
}

export async function requireCurrentUser(): Promise<StoredAccount> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return user;
}
