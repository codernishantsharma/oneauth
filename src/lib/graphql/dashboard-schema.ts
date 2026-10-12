import "server-only";

import { buildSchema, graphql } from "graphql";

import { db } from "@/src/prisma/db";
import type { StoredAccount } from "@/src/lib/auth/account-store";

export type DashboardGraphQLContext = {
  user: StoredAccount;
};

export const dashboardSchema = buildSchema(`
  type DashboardUser {
    id: ID!
    email: String!
    username: String
    displayName: String
    status: String!
    createdAt: String!
  }

  type DashboardMetrics {
    activeSessions: Int!
    passkeys: Int!
    connectedApps: Int!
    recentSecurityEvents: Int!
  }

  type DashboardData {
    user: DashboardUser!
    metrics: DashboardMetrics!
  }

  type Query {
    dashboard: DashboardData!
  }
`);

const dashboardQuery = `
  query OneAuthDashboard {
    dashboard {
      user { id email username displayName status createdAt }
      metrics { activeSessions passkeys connectedApps recentSecurityEvents }
    }
  }
`;

const rootValue = {
  dashboard: async (_args: unknown, context: DashboardGraphQLContext) => {
    const userId = context.user.id;
    const query = db.raw.sql`
      SELECT
        (SELECT count(*)::int4 FROM public.sessions
          WHERE user_id = ${userId}::uuid
            AND revoked_at IS NULL
            AND expires_at > now()) AS active_sessions,
        (SELECT count(*)::int4 FROM public.passkey_credentials
          WHERE user_id = ${userId}::uuid) AS passkeys,
        (SELECT count(*)::int4 FROM public.oauth_consents
          WHERE user_id = ${userId}::uuid
            AND status = 'ACTIVE'
            AND (expires_at IS NULL OR expires_at > now())) AS connected_apps,
        (SELECT count(*)::int4 FROM public.security_events
          WHERE user_id = ${userId}::uuid
            AND occurred_at >= now() - interval '30 days') AS recent_security_events
    `.returnsRow({
      active_sessions: "pg/int4@1",
      passkeys: "pg/int4@1",
      connected_apps: "pg/int4@1",
      recent_security_events: "pg/int4@1",
    }).build();

    const [metrics] = await db.runtime().query(query);
    if (!metrics) throw new Error("DASHBOARD_DATA_UNAVAILABLE");

    return {
      user: {
        id: context.user.id,
        email: context.user.email,
        username: context.user.username,
        displayName: context.user.displayName,
        status: context.user.status,
        createdAt: context.user.createdAt,
      },
      metrics: {
        activeSessions: metrics.active_sessions,
        passkeys: metrics.passkeys,
        connectedApps: metrics.connected_apps,
        recentSecurityEvents: metrics.recent_security_events,
      },
    };
  },
};

export async function executeDashboardGraphQL(user: StoredAccount) {
  const result = await graphql({
    schema: dashboardSchema,
    source: dashboardQuery,
    rootValue,
    contextValue: { user } satisfies DashboardGraphQLContext,
  });

  if (result.errors?.length || !result.data?.dashboard) {
    throw new Error("DASHBOARD_DATA_UNAVAILABLE");
  }

  return result.data.dashboard as {
    user: DashboardGraphQLContext["user"] & { createdAt: string };
    metrics: {
      activeSessions: number;
      passkeys: number;
      connectedApps: number;
      recentSecurityEvents: number;
    };
  };
}
