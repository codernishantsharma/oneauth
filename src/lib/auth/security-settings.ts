import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { cookies, headers } from "next/headers";
import { db } from "@/src/prisma/db";
import { requireCurrentUser, SESSION_COOKIE_NAME } from "@/src/lib/auth/session";
import { writeSecurityEvent } from "@/src/lib/auth/security-events";
import { deleteTemporaryValue, getTemporaryValue, setTemporaryValue } from "@/src/lib/redis/temporary";

const TOTP_SETUP_PREFIX = "oneauth:totp-setup:";
const TOTP_SETUP_TTL = 10 * 60;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function encryptionKey() {
  const value = process.env.ONEAUTH_ENCRYPTION_KEY;
  if (!value || !/^(?:[0-9a-fA-F]{64}|[A-Za-z0-9_-]{43,44})$/.test(value)) {
    throw new Error("ONEAUTH_ENCRYPTION_KEY must be a 32-byte hex or base64url key.");
  }
  const key = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64url");
  if (key.length !== 32) throw new Error("ONEAUTH_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

function encryptSecret(secret: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

function decryptSecret(ciphertext: Uint8Array, nonce: Uint8Array, tag: Uint8Array) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce));
  decipher.setAuthTag(Buffer.from(tag));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]).toString("utf8");
}

function base32Encode(input: Uint8Array) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string) {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/g, "").replace(/\s/g, "")) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("INVALID_TOTP_SECRET");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totpAt(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string) {
  const normalized = code.replace(/\s|-/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (const drift of [-30_000, 0, 30_000]) {
    const expected = Buffer.from(totpAt(secret, now + drift));
    const actual = Buffer.from(normalized);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true;
  }
  return false;
}

function hashRecoveryCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase().replace(/\s|-/g, "")).digest("hex");
}

function makeRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString("hex").toUpperCase();
    return raw.match(/.{1,4}/g)!.join("-");
  });
}

async function currentUserAndPassword(password: string) {
  const user = await requireCurrentUser();
  const query = db.raw.sql`SELECT password_hash AS "passwordHash" FROM public.password_credentials WHERE user_id = ${user.id}::uuid`.returnsRow({ passwordHash: "pg/text@1" }).build();
  const rows = await db.runtime().query(query);
  if (!rows[0] || !(await argon2.verify(rows[0].passwordHash, password).catch(() => false))) {
    throw new Error("CURRENT_PASSWORD_INCORRECT");
  }
  return user;
}

async function enabledTotp(userId: string) {
  const query = db.raw.sql`SELECT id, secret_ciphertext AS "ciphertext", secret_nonce AS "nonce", secret_auth_tag AS "authTag"
    FROM public.totp_credentials WHERE user_id = ${userId}::uuid AND is_enabled = true
    ORDER BY created_at DESC LIMIT 1`.returnsRow({
      id: "pg/uuid@1", ciphertext: "pg/bytea@1", nonce: "pg/bytea@1", authTag: "pg/bytea@1",
    }).build();
  const rows = await db.runtime().query(query);
  if (!rows[0]) return null;
  return { id: rows[0].id, secret: decryptSecret(rows[0].ciphertext, rows[0].nonce, rows[0].authTag) };
}

export async function getSecurityOverview() {
  const user = await requireCurrentUser();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
  const sessionHash = createHash("sha256").update(sessionToken).digest("hex");
  const [totpQuery, recoveryQuery, sessionsQuery, passkeysQuery, currentQuery] = [
    db.raw.sql`SELECT EXISTS(SELECT 1 FROM public.totp_credentials WHERE user_id = ${user.id}::uuid AND is_enabled = true) AS enabled`.returnsRow({ enabled: "pg/bool@1" }).build(),
    db.raw.sql`SELECT count(*)::int AS remaining FROM public.recovery_codes WHERE user_id = ${user.id}::uuid AND used_at IS NULL`.returnsRow({ remaining: "pg/int4@1" }).build(),
    db.raw.sql`SELECT count(*)::int AS active FROM public.sessions WHERE user_id = ${user.id}::uuid AND revoked_at IS NULL AND expires_at > now()`.returnsRow({ active: "pg/int4@1" }).build(),
    db.raw.sql`SELECT count(*)::int AS count FROM public.passkey_credentials WHERE user_id = ${user.id}::uuid`.returnsRow({ count: "pg/int4@1" }).build(),
    db.raw.sql`SELECT id FROM public.sessions WHERE user_id = ${user.id}::uuid AND session_hash = ${sessionHash} AND revoked_at IS NULL AND expires_at > now() LIMIT 1`.returnsRow({ id: "pg/uuid@1" }).build(),
  ];
  const [totp, recovery, sessions, passkeys, current] = await Promise.all([
    db.runtime().query(totpQuery), db.runtime().query(recoveryQuery), db.runtime().query(sessionsQuery),
    db.runtime().query(passkeysQuery), db.runtime().query(currentQuery),
  ]);
  return {
    totpEnabled: Boolean(totp[0]?.enabled),
    recoveryCodesRemaining: recovery[0]?.remaining ?? 0,
    activeSessions: sessions[0]?.active ?? 0,
    passkeyCount: passkeys[0]?.count ?? 0,
    currentSessionId: current[0]?.id ?? null,
  };
}

export async function beginTotpEnrollment() {
  const user = await requireCurrentUser();
  const existing = await enabledTotp(user.id);
  if (existing) throw new Error("TOTP_ALREADY_ENABLED");
  const secret = base32Encode(randomBytes(20));
  await setTemporaryValue(`${TOTP_SETUP_PREFIX}${user.id}`, secret, TOTP_SETUP_TTL);
  const label = encodeURIComponent(user.email);
  const issuer = encodeURIComponent("OneAuth");
  return {
    secret,
    otpauthUrl: `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
  };
}

export async function confirmTotpEnrollment(code: string) {
  const user = await requireCurrentUser();
  const secret = await getTemporaryValue(`${TOTP_SETUP_PREFIX}${user.id}`);
  if (!secret) throw new Error("TOTP_SETUP_EXPIRED");
  if (!verifyTotp(secret, code)) throw new Error("TOTP_CODE_INVALID");
  const encrypted = encryptSecret(secret);
  const codes = makeRecoveryCodes();
  const now = new Date().toISOString();
  const credentialId = randomUUID();
  const recoveryRecords = JSON.stringify(codes.map((value) => ({ id: randomUUID(), hash: hashRecoveryCode(value) })));
  const query = db.raw.sql`WITH new_totp AS (
      INSERT INTO public.totp_credentials
        (id, user_id, secret_ciphertext, secret_nonce, secret_auth_tag, encryption_key_ref, encryption_algorithm, is_enabled, enabled_at, created_at, updated_at)
      VALUES (${credentialId}::uuid, ${user.id}::uuid, ${encrypted.ciphertext}::bytea, ${encrypted.nonce}::bytea, ${encrypted.tag}::bytea, 'env:ONEAUTH_ENCRYPTION_KEY', 'AES-256-GCM', true, ${now}::timestamptz, ${now}::timestamptz, ${now}::timestamptz)
      RETURNING id, user_id
    ), new_codes AS (
      INSERT INTO public.recovery_codes (id, user_id, code_hash, created_at, used_at)
      SELECT (item->>'id')::uuid, new_totp.user_id, item->>'hash', ${now}::timestamptz, NULL
      FROM new_totp CROSS JOIN jsonb_array_elements(${recoveryRecords}::jsonb) AS item
      RETURNING id
    )
    SELECT id FROM new_totp`.returnsRow({ id: "pg/uuid@1" }).build();
  await db.runtime().query(query);
  await deleteTemporaryValue(`${TOTP_SETUP_PREFIX}${user.id}`);
  await writeSecurityEvent({ userId: user.id, eventType: "TOTP_ENABLED", headers: await headers(), metadata: { recoveryCodesGenerated: codes.length } });
  return { recoveryCodes: codes };
}

export async function disableTotp(password: string, code: string) {
  const user = await currentUserAndPassword(password);
  const credential = await enabledTotp(user.id);
  if (!credential) throw new Error("TOTP_NOT_ENABLED");
  if (!verifyTotp(credential.secret, code)) throw new Error("TOTP_CODE_INVALID");
  const now = new Date().toISOString();
  const query = db.raw.sql`WITH disabled AS (
      UPDATE public.totp_credentials SET is_enabled = false, enabled_at = NULL, updated_at = ${now}::timestamptz
      WHERE id = ${credential.id}::uuid AND user_id = ${user.id}::uuid RETURNING id
    ), removed_codes AS (
      DELETE FROM public.recovery_codes WHERE user_id = ${user.id}::uuid RETURNING id
    )
    SELECT id FROM disabled`.returnsRow({ id: "pg/uuid@1" }).build();
  await db.runtime().query(query);
  await writeSecurityEvent({ userId: user.id, eventType: "TOTP_DISABLED", headers: await headers() });
  return { success: true };
}

export async function regenerateRecoveryCodes(password: string) {
  const user = await currentUserAndPassword(password);
  const credential = await enabledTotp(user.id);
  if (!credential) throw new Error("TOTP_NOT_ENABLED");
  const codes = makeRecoveryCodes();
  const now = new Date().toISOString();
  const recoveryRecords = JSON.stringify(codes.map((value) => ({ id: randomUUID(), hash: hashRecoveryCode(value) })));
  const query = db.raw.sql`WITH removed AS (
      DELETE FROM public.recovery_codes WHERE user_id = ${user.id}::uuid RETURNING id
    ), inserted AS (
      INSERT INTO public.recovery_codes (id, user_id, code_hash, created_at, used_at)
      SELECT (item->>'id')::uuid, ${user.id}::uuid, item->>'hash', ${now}::timestamptz, NULL
      FROM jsonb_array_elements(${recoveryRecords}::jsonb) AS item
      RETURNING id
    )
    SELECT id FROM inserted`.returnsRow({ id: "pg/uuid@1" }).build();
  await db.runtime().query(query);
  return { recoveryCodes: codes };
}

export async function getRecoveryCodeCount() {
  const user = await requireCurrentUser();
  const query = db.raw.sql`SELECT count(*)::int AS remaining FROM public.recovery_codes WHERE user_id = ${user.id}::uuid AND used_at IS NULL`.returnsRow({ remaining: "pg/int4@1" }).build();
  const rows = await db.runtime().query(query);
  return rows[0]?.remaining ?? 0;
}

export async function changeAccountPassword(currentPassword: string, newPassword: string) {
  if (typeof newPassword !== "string" || newPassword.length < 12 || newPassword.length > 128) throw new Error("NEW_PASSWORD_POLICY");
  const user = await currentUserAndPassword(currentPassword);
  const hash = await argon2.hash(newPassword);
  const now = new Date().toISOString();
  await db.runtime().query(db.raw.sql`UPDATE public.password_credentials SET password_hash = ${hash}, hash_algorithm = 'argon2id', changed_at = ${now}::timestamptz WHERE user_id = ${user.id}::uuid RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
  const currentHash = createHash("sha256").update(sessionToken).digest("hex");
  await db.runtime().query(db.raw.sql`UPDATE public.sessions SET revoked_at = ${now}::timestamptz WHERE user_id = ${user.id}::uuid AND session_hash <> ${currentHash} AND revoked_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build());
  await writeSecurityEvent({ userId: user.id, eventType: "PASSWORD_CHANGED", headers: await headers(), metadata: { otherSessionsRevoked: true } });
  return { success: true };
}

export async function listAccountSessions() {
  const user = await requireCurrentUser();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const query = db.raw.sql`SELECT id, created_at AS "createdAt", last_seen_at AS "lastSeenAt", expires_at AS "expiresAt", (revoked_at IS NULL AND expires_at > now()) AS "isActive", ip_address AS "ipAddress", user_agent AS "userAgent", revoked_at AS "revokedAt", (session_hash = ${tokenHash}) AS "isCurrent"
    FROM public.sessions WHERE user_id = ${user.id}::uuid
    ORDER BY (revoked_at IS NULL AND expires_at > now()) DESC, last_seen_at DESC LIMIT 50`.returnsRow({
      id: "pg/uuid@1", createdAt: "pg/timestamptz-date@1", lastSeenAt: "pg/timestamptz-date@1",
      expiresAt: "pg/timestamptz-date@1", isActive: "pg/bool@1", ipAddress: "pg/text@1", userAgent: "pg/text@1",
      revokedAt: "pg/timestamptz-date@1", isCurrent: "pg/bool@1",
    }).build();
  const rows = await db.runtime().query(query);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    lastSeenAt: row.lastSeenAt instanceof Date ? row.lastSeenAt.toISOString() : String(row.lastSeenAt),
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
    isActive: Boolean(row.isActive),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    revokedAt: row.revokedAt ? (row.revokedAt instanceof Date ? row.revokedAt.toISOString() : String(row.revokedAt)) : null,
    isCurrent: Boolean(row.isCurrent),
  }));
}

export async function revokeAccountSession(sessionId: string) {
  const user = await requireCurrentUser();
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("INVALID_SESSION_ID");
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
  const currentHash = createHash("sha256").update(currentToken).digest("hex");
  const query = db.raw.sql`UPDATE public.sessions SET revoked_at = now()
    WHERE id = ${sessionId}::uuid AND user_id = ${user.id}::uuid AND session_hash <> ${currentHash}
      AND revoked_at IS NULL AND expires_at > now() RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build();
  const rows = await db.runtime().query(query);
  if (!rows.length) throw new Error("SESSION_NOT_FOUND_OR_CURRENT");
  await writeSecurityEvent({ userId: user.id, eventType: "SESSION_REVOKED", headers: await headers(), metadata: { sessionId, reason: "USER_REVOKED" } });
  return { success: true };
}

export async function verifyTotpForLogin(userId: string, code: string) {
  const credential = await enabledTotp(userId);
  if (!credential) return false;
  if (verifyTotp(credential.secret, code)) return true;
  const normalized = hashRecoveryCode(code);
  if (!/^[A-F0-9]{16}$/.test(code.trim().replace(/-/g, "").toUpperCase())) return false;
  const query = db.raw.sql`UPDATE public.recovery_codes SET used_at = now()
    WHERE user_id = ${userId}::uuid AND code_hash = ${normalized} AND used_at IS NULL RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build();
  const rows = await db.runtime().query(query);
  if (rows.length) await writeSecurityEvent({ userId, eventType: "RECOVERY_CODE_USED", metadata: { remainingUpdated: true } });
  return rows.length > 0;
}


export async function hasTotpEnabled(userId: string) {
  const query = db.raw.sql`SELECT EXISTS(SELECT 1 FROM public.totp_credentials WHERE user_id = ${userId}::uuid AND is_enabled = true) AS enabled`.returnsRow({ enabled: "pg/bool@1" }).build();
  const rows = await db.runtime().query(query);
  return Boolean(rows[0]?.enabled);
}
