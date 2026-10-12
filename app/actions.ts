"use server";

import { getCurrentUser, requireCurrentUser } from "@/src/lib/auth/session";
import { getOneAuthRole } from "@/src/lib/auth/admin";
import { executeDashboardGraphQL } from "@/src/lib/graphql/dashboard-schema";
import { db } from "@/src/prisma/db";

export type DashboardData = {
  user: {
    id: string;
    email: string;
    username: string | null;
    displayName: string | null;
    status: string;
    createdAt: string;
  };
  metrics: {
    activeSessions: number;
    passkeys: number;
    connectedApps: number;
    recentSecurityEvents: number;
  };
};

export type PortalHeaderUser = {
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: "ADMIN" | "USER";
};

export async function getPortalHeaderUser(): Promise<PortalHeaderUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const profile = await db.orm.public.Profile.where({ userId: user.id }).first();
  return {
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: profile?.avatarUrl ?? null,
    role: await getOneAuthRole(user.email, user.id),
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const user = await requireCurrentUser();
  return await executeDashboardGraphQL(user) as DashboardData;
}
