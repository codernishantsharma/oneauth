import "server-only";

import { randomUUID } from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "@/src/prisma/db";
import { getCurrentUser } from "@/src/lib/auth/session";
import { deleteTemporaryValue, getTemporaryValue, setTemporaryValue } from "@/src/lib/redis/temporary";
import { writeSecurityEvent } from "@/src/lib/auth/security-events";

const CHALLENGE_TTL_SECONDS = 5 * 60;
const CHALLENGE_PREFIX = "oneauth:passkey-registration:";
const RP_NAME = "OneAuth";

function relyingParty() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredUrl) throw new Error("NEXT_PUBLIC_APP_URL_REQUIRED");
  const url = new URL(configuredUrl);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("PASSKEYS_REQUIRE_HTTPS");
  }
  return { origin: url.origin, rpID: url.hostname };
}

function challengeKey(userId: string) {
  return `${CHALLENGE_PREFIX}${userId}`;
}

function encodeBase64Url(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

export async function createPasskeyRegistrationOptions() {
  const user = await getCurrentUser();
  if (!user) return { error: "UNAUTHENTICATED" as const, status: 401 as const };

  const { rpID } = relyingParty();
  const existingQuery = db.raw.sql`SELECT credential_id FROM public.passkey_credentials
    WHERE user_id = ${user.id}::uuid`.returnsRow({ credential_id: "pg/bytea@1" }).build();
  const existing = await db.runtime().query(existingQuery);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new Uint8Array(Buffer.from(user.id.replaceAll("-", ""), "hex")),
    userName: user.email,
    userDisplayName: user.displayName || user.username || user.email,
    attestationType: "none",
    excludeCredentials: existing.map((item) => ({
      id: encodeBase64Url(item.credential_id),
      type: "public-key" as const,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
  });

  await setTemporaryValue(challengeKey(user.id), options.challenge, CHALLENGE_TTL_SECONDS);
  return { options };
}

export async function verifyPasskeyRegistration(
  headers: Headers,
  response: RegistrationResponseJSON,
  requestedName: unknown,
) {
  const user = await getCurrentUser();
  if (!user) return { error: "UNAUTHENTICATED" as const, status: 401 as const };

  const { origin, rpID } = relyingParty();
  const challenge = await getTemporaryValue(challengeKey(user.id));
  if (!challenge) return { error: "CHALLENGE_EXPIRED" as const, status: 410 as const };

  // Consume the challenge before verification so it cannot be replayed.
  await deleteTemporaryValue(challengeKey(user.id));
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return { error: "REGISTRATION_VERIFICATION_FAILED" as const, status: 400 as const };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { error: "REGISTRATION_VERIFICATION_FAILED" as const, status: 400 as const };
  }

  const info = verification.registrationInfo;
  const credential = info.credential;
  const name = typeof requestedName === "string" ? requestedName.trim().slice(0, 64) : "";
  const credentialName = name || "Passkey";
  const deviceType = info.credentialDeviceType === "multiDevice" ? "MULTI_DEVICE" : "SINGLE_DEVICE";
  const credentialId = new Uint8Array(Buffer.from(credential.id, "base64url"));
  const publicKey = new Uint8Array(credential.publicKey);
  const allowedTransports = new Set(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"]);
  const transports = (credential.transports ?? []).filter((value) => allowedTransports.has(value));
  const transportsLiteral = `{${transports.join(",")}}`;
  const now = new Date().toISOString();
  const passkeyId = randomUUID();

  try {
    const query = db.raw.sql`INSERT INTO public.passkey_credentials
      (id, user_id, credential_id, public_key, signature_counter, transports,
       device_type, backed_up, aaguid, credential_name, created_at, last_used_at)
      VALUES (${passkeyId}::uuid, ${user.id}::uuid, ${credentialId}::bytea,
       ${publicKey}::bytea, ${BigInt(credential.counter)}::bigint,
       ${transportsLiteral}::text[], ${deviceType}, ${info.credentialBackedUp},
       NULLIF(${info.aaguid ?? ""}::text, ''), ${credentialName},
       ${now}::timestamptz, NULL) RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build();
    await db.runtime().query(query);
    await writeSecurityEvent({
      userId: user.id,
      eventType: "PASSKEY_ADDED",
      headers,
      metadata: { passkeyId, name: credentialName },
    });
  } catch (error) {
    // Do not expose database details or credential material to the client.
    if (String(error).includes("unique") || String(error).includes("duplicate")) {
      return { error: "PASSKEY_ALREADY_REGISTERED" as const, status: 409 as const };
    }
    throw error;
  }

  return { success: true as const, id: passkeyId, name: credentialName };
}

export async function listPasskeys() {
  const user = await getCurrentUser();
  if (!user) return { error: "UNAUTHENTICATED" as const, status: 401 as const };
  const query = db.raw.sql`SELECT id, credential_name AS name, device_type,
      backed_up AS "backedUp", created_at AS "createdAt", last_used_at AS "lastUsedAt"
    FROM public.passkey_credentials
    WHERE user_id = ${user.id}::uuid
    ORDER BY created_at DESC`.returnsRow({
      id: "pg/uuid@1",
      name: "pg/text@1",
      device_type: "pg/text@1",
      backedUp: "pg/bool@1",
      createdAt: "pg/timestamptz-date@1",
      lastUsedAt: "pg/timestamptz-date@1",
    }).build();
  const passkeys = await db.runtime().query(query);
  return {
    passkeys: passkeys.map((item) => ({
      id: item.id,
      name: item.name,
      deviceType: item.device_type === "MULTI_DEVICE" ? "MULTI_DEVICE" as const : "SINGLE_DEVICE" as const,
      backedUp: item.backedUp,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
      lastUsedAt: item.lastUsedAt ? (item.lastUsedAt instanceof Date ? item.lastUsedAt.toISOString() : String(item.lastUsedAt)) : null,
    })),
  };
}

export async function removePasskey(headers: Headers, passkeyId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "UNAUTHENTICATED" as const, status: 401 as const };
  if (!/^[0-9a-f-]{36}$/i.test(passkeyId)) {
    return { error: "INVALID_PASSKEY_ID" as const, status: 400 as const };
  }

  const query = db.raw.sql`DELETE FROM public.passkey_credentials
    WHERE id = ${passkeyId}::uuid AND user_id = ${user.id}::uuid
    RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build();
  const deleted = await db.runtime().query(query);
  if (!deleted.length) return { error: "PASSKEY_NOT_FOUND" as const, status: 404 as const };
  await writeSecurityEvent({
    userId: user.id,
    eventType: "PASSKEY_REMOVED",
    headers,
    metadata: { passkeyId },
  });
  return { success: true as const };
}
