import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/src/prisma/db";
import { createSessionForUser, findAccountById } from "@/src/lib/auth/account-store";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/src/lib/auth/session";
import { deleteTemporaryValue, getTemporaryValue, setTemporaryValue } from "@/src/lib/redis/temporary";
import { writeSecurityEvent } from "@/src/lib/auth/security-events";

const CHALLENGE_PREFIX = "oneauth:passkey-login:";
const CHALLENGE_TTL_SECONDS = 5 * 60;

function relyingParty() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) throw new Error("NEXT_PUBLIC_APP_URL_REQUIRED");
  const url = new URL(configuredUrl);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("PASSKEYS_REQUIRE_HTTPS");
  return { origin: url.origin, rpID: url.hostname };
}

function key(token: string) {
  return CHALLENGE_PREFIX + createHash("sha256").update(token).digest("hex");
}

export async function beginPasskeyLogin() {
  const { rpID } = relyingParty();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  const challengeToken = randomBytes(32).toString("base64url");
  await setTemporaryValue(key(challengeToken), options.challenge, CHALLENGE_TTL_SECONDS);
  return { options, challengeToken };
}

export async function finishPasskeyLogin(
  request: Request,
  challengeToken: string,
  response: AuthenticationResponseJSON,
) {
  if (!challengeToken || challengeToken.length > 200) return { error: "PASSKEY_CHALLENGE_EXPIRED" as const, status: 410 as const };
  const challengeKey = key(challengeToken);
  const expectedChallenge = await getTemporaryValue(challengeKey);
  if (!expectedChallenge) return { error: "PASSKEY_CHALLENGE_EXPIRED" as const, status: 410 as const };
  await deleteTemporaryValue(challengeKey);

  const { origin, rpID } = relyingParty();
  const credentialId = Buffer.from(response.id, "base64url");
  const query = db.raw.sql`SELECT id::text AS id, user_id::text AS "userId",
      encode(credential_id, 'base64') AS "credentialIdBase64",
      encode(public_key, 'base64') AS "publicKeyBase64",
      signature_counter::text AS "signatureCounter",
      array_to_json(transports)::text AS "transportsJson"
    FROM public.passkey_credentials WHERE credential_id = ${credentialId}::bytea LIMIT 1`.returnsRow({
    id: "pg/text@1", userId: "pg/text@1", credentialIdBase64: "pg/text@1",
    publicKeyBase64: "pg/text@1", signatureCounter: "pg/text@1", transportsJson: "pg/text@1",
  }).build();
  const rows = await db.runtime().query(query);
  const credential = rows[0];
  if (!credential) return { error: "PASSKEY_NOT_RECOGNIZED" as const, status: 401 as const };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: Buffer.from(credential.credentialIdBase64, "base64").toString("base64url"),
        publicKey: new Uint8Array(Buffer.from(credential.publicKeyBase64, "base64")),
        counter: Number(credential.signatureCounter),
        transports: JSON.parse(credential.transportsJson || "[]") as string[],
      },
    });
  } catch {
    return { error: "PASSKEY_VERIFICATION_FAILED" as const, status: 401 as const };
  }
  if (!verification.verified) return { error: "PASSKEY_VERIFICATION_FAILED" as const, status: 401 as const };

  const user = await findAccountById(credential.userId);
  if (!user || user.status !== "ACTIVE" || !user.verifiedAt) {
    return { error: "ACCOUNT_NOT_AVAILABLE" as const, status: 403 as const };
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const session = await createSessionForUser(user.id, {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  });
  await db.runtime().query(db.raw.sql`UPDATE public.passkey_credentials
    SET signature_counter = ${BigInt(verification.authenticationInfo.newCounter)}::bigint, last_used_at = now()
    WHERE id = ${credential.id}::uuid AND user_id = ${user.id}::uuid RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  await writeSecurityEvent({ userId: user.id, eventType: "LOGIN_SUCCESS", headers: request.headers, metadata: { method: "PASSKEY" } });
  await writeSecurityEvent({ userId: user.id, eventType: "SESSION_CREATED", headers: request.headers, metadata: { expiresAt: session.expiresAt, method: "PASSKEY" } });

  const { NextResponse } = await import("next/server");
  const result = NextResponse.json({ ok: true, userId: user.id });
  result.cookies.set(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return { response: result };
}
