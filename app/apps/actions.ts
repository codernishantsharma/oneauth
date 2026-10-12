"use server";

import { requireCurrentUser } from "@/src/lib/auth/session";
import { db } from "@/src/prisma/db";

export type ConnectedApp = {
  consentId: string;
  clientId: string;
  name: string;
  description: string | null;
  clientType: string;
  environment: string;
  connectedAt: string;
  lastUsedAt: string | null;
  scopes: string[];
  activeTokens: number;
};

export async function listConnectedApps(): Promise<ConnectedApp[]> {
  const user = await requireCurrentUser();
  const rows = await db.runtime().query(db.raw.sql`
    SELECT
      co.id AS "consentId",
      c.client_id AS "clientId",
      c.name,
      c.description,
      c.client_type AS "clientType",
      c.environment,
      co.granted_at AS "connectedAt",
      (SELECT max(t.issued_at) FROM public.access_tokens t
        WHERE t.user_id = co.user_id AND t.oauth_client_id = c.id) AS "lastUsedAt",
      COALESCE((SELECT string_agg(cs.scope_name, chr(31) ORDER BY cs.scope_name)
        FROM public.oauth_consent_scopes cs WHERE cs.consent_id = co.id), '') AS scopes,
      (SELECT count(*)::int4 FROM public.access_tokens t
        WHERE t.user_id = co.user_id AND t.oauth_client_id = c.id
          AND t.revoked_at IS NULL AND t.expires_at > now()) AS "activeTokens"
    FROM public.oauth_consents co
    JOIN public.oauth_clients c ON c.id = co.oauth_client_id
    LEFT JOIN public.organizations o ON o.id = c.organization_id
    WHERE co.user_id = ${user.id}::uuid
      AND co.status = 'ACTIVE'
      AND co.revoked_at IS NULL
      AND (co.expires_at IS NULL OR co.expires_at > now())
      AND c.is_active = true AND c.deleted_at IS NULL
      AND (c.organization_id IS NULL OR (o.status = 'ACTIVE' AND o.deleted_at IS NULL))
    ORDER BY co.granted_at DESC
  `.returnsRow({
    consentId: "pg/uuid@1",
    clientId: "pg/text@1",
    name: "pg/text@1",
    description: "pg/text@1",
    clientType: "pg/text@1",
    environment: "pg/text@1",
    connectedAt: "pg/timestamptz-string@1",
    lastUsedAt: "pg/timestamptz-string@1",
    scopes: "pg/text@1",
    activeTokens: "pg/int4@1",
  }).build());
  return rows.map((row) => ({ ...row, scopes: row.scopes ? row.scopes.split("\u001f").filter(Boolean) : [], activeTokens: Number(row.activeTokens ?? 0) })) as ConnectedApp[];
}

export async function revokeConnectedApp(consentId: string): Promise<void> {
  const user = await requireCurrentUser();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(consentId)) {
    throw new Error("CONNECTED_APP_NOT_FOUND");
  }

  const owned = await db.runtime().query(db.raw.sql`
    SELECT id, oauth_client_id AS "clientId" FROM public.oauth_consents
    WHERE id = ${consentId}::uuid AND user_id = ${user.id}::uuid
      AND status = 'ACTIVE' AND revoked_at IS NULL LIMIT 1
  `.returnsRow({ id: "pg/uuid@1", clientId: "pg/uuid@1" }).build());
  const consent = owned[0];
  if (!consent) throw new Error("CONNECTED_APP_NOT_FOUND");

  // Revoke both token types before marking the grant revoked. Tokens are opaque
  // hashes in storage; only this user's grant and its client are targeted.
  await db.runtime().query(db.raw.sql`
    UPDATE public.access_tokens SET revoked_at = COALESCE(revoked_at, now())
    WHERE user_id = ${user.id}::uuid AND oauth_client_id = ${consent.clientId}::uuid
      AND revoked_at IS NULL RETURNING id
  `.returnsRow({ id: "pg/uuid@1" }).build());
  await db.runtime().query(db.raw.sql`
    UPDATE public.refresh_tokens SET revoked_at = COALESCE(revoked_at, now())
    WHERE user_id = ${user.id}::uuid AND oauth_client_id = ${consent.clientId}::uuid
      AND revoked_at IS NULL RETURNING id
  `.returnsRow({ id: "pg/uuid@1" }).build());
  await db.runtime().query(db.raw.sql`
    UPDATE public.oauth_consents SET status = 'REVOKED', revoked_at = now()
    WHERE id = ${consentId}::uuid AND user_id = ${user.id}::uuid
      AND status = 'ACTIVE' AND revoked_at IS NULL RETURNING id
  `.returnsRow({ id: "pg/uuid@1" }).build());


}
