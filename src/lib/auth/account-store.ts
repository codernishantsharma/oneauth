import { createHash, randomBytes, randomUUID } from "node:crypto";

import argon2 from "argon2";

import { getRedisClient } from "../redis/client.ts";
import { db } from "../../prisma/db.ts";

export type StoredAccountStatus = "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED" | "DELETED";

export type StoredAccount = {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  status: StoredAccountStatus;
  verifiedAt?: string | null;
  verificationToken?: string;
};

export type StoredSession = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type PendingRegistration = {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  passwordHash: string;
  createdAt: string;
  expiresAt: string;
};

const PENDING_TTL_SECONDS = 3 * 60 * 60;
const PENDING_KEY_PREFIX = "oneauth:pending-registration:";
const PENDING_EMAIL_PREFIX = "oneauth:pending-email:";

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function redis() {
  if (!process.env["UPSTASH_REDIS_REST_URL"] || !process.env["UPSTASH_REDIS_REST_TOKEN"]) {
    throw new Error("REDIS_REQUIRED");
  }
  return getRedisClient();
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export async function findAccountById(userId: string): Promise<StoredAccount | undefined> {
  const user = await db.orm.public.User.first({ id: userId });
  if (!user) return undefined;

  const [profile, email] = await Promise.all([
    db.orm.public.Profile.where({ userId }).first(),
    db.orm.public.EmailAddress.where({ userId, isPrimary: true }).first(),
  ]);
  const credential = await db.orm.public.PasswordCredential.where({ userId }).first();
  if (!email || !credential) return undefined;

  return {
    id: user.id,
    email: email.normalizedEmail,
    username: profile?.username ?? null,
    displayName: profile?.displayName ?? null,
    passwordHash: credential.passwordHash,
    createdAt: asIso(user.createdAt),
    updatedAt: asIso(user.updatedAt),
    status: user.status,
    verifiedAt: email.verifiedAt ? asIso(email.verifiedAt) : null,
  };
}

export async function findAccountByEmail(email: string): Promise<StoredAccount | undefined> {
  const normalized = email.trim().toLowerCase();
  const emailRecord = await db.orm.public.EmailAddress.where({ normalizedEmail: normalized }).first();
  if (!emailRecord) return undefined;
  return findAccountById(emailRecord.userId);
}

export async function discardPendingRegistration(token: string, email: string): Promise<void> {
  await removePendingRegistration(hashToken(token), email.trim().toLowerCase());
}

export async function rotatePendingVerificationToken(
  email: string,
): Promise<{ token: string; email: string; displayName: string | null } | null> {
  const client = await redis();
  const normalizedEmail = email.trim().toLowerCase();
  const emailKey = `${PENDING_EMAIL_PREFIX}${normalizedEmail}`;
  const currentHash = await client.get<string | null>(emailKey);
  if (!currentHash) return null;

  const currentKey = `${PENDING_KEY_PREFIX}${currentHash}`;
  const current = await client.get<PendingRegistration | null>(currentKey);
  if (!current || new Date(current.expiresAt).getTime() <= Date.now()) {
    if (current) {
      await removePendingRegistration(currentHash, normalizedEmail);
    } else {
      await client.del(emailKey);
    }
    return null;
  }

  const cooldownKey = `oneauth:verification-resend-cooldown:${hashToken(normalizedEmail)}`;
  const allowed = await client.set(cooldownKey, "1", { ex: 60, nx: true });
  if (allowed !== "OK") throw new Error("RESEND_RATE_LIMITED");

  const token = randomBytes(32).toString("base64url");
  const nextHash = hashToken(token);
  const next: PendingRegistration = {
    ...current,
    expiresAt: new Date(Date.now() + PENDING_TTL_SECONDS * 1000).toISOString(),
  };

  await client.set(`${PENDING_KEY_PREFIX}${nextHash}`, next, { ex: PENDING_TTL_SECONDS });
  await client.set(emailKey, nextHash, { ex: PENDING_TTL_SECONDS });
  await client.del(currentKey);

  return { token, email: normalizedEmail, displayName: current.displayName };
}

async function createVerifiedAccount(record: PendingRegistration): Promise<void> {
  const now = new Date().toISOString();
  const profileId = randomUUID();
  const emailId = randomUUID();
  const credentialId = randomUUID();

  // These data-modifying CTEs create the user and related records atomically.
  // A single data-modifying SQL statement makes the five related inserts atomic.
  // If any constraint fails, PostgreSQL rolls the whole statement back.
  const query = db.raw.sql`WITH new_user AS (
    INSERT INTO public.users (id, status, created_at, updated_at)
    VALUES (${record.id}::uuid, 'ACTIVE', ${now}::timestamptz, ${now}::timestamptz)
    RETURNING id
  ), new_profile AS (
    INSERT INTO public.profiles
      (id, user_id, display_name, username, normalized_username, created_at, updated_at)
    SELECT ${profileId}::uuid, id, NULLIF(${record.displayName ?? ""}::text, ''),
      NULLIF(${record.username ?? ""}::text, ''),
      NULLIF(${record.username?.toLowerCase() ?? ""}::text, ''), ${now}::timestamptz, ${now}::timestamptz
    FROM new_user
    RETURNING id
  ), new_email AS (
    INSERT INTO public.email_addresses
      (id, user_id, normalized_email, verified_at, is_primary, created_at, updated_at)
    SELECT ${emailId}::uuid, id, ${record.email}, ${now}::timestamptz, true,
      ${now}::timestamptz, ${now}::timestamptz
    FROM new_user
    RETURNING id
  ), new_credential AS (
    INSERT INTO public.password_credentials
      (id, user_id, password_hash, hash_algorithm, changed_at, created_at)
    SELECT ${credentialId}::uuid, id, ${record.passwordHash}, 'argon2id',
      ${now}::timestamptz, ${now}::timestamptz
    FROM new_user
    RETURNING id
  )
  SELECT id FROM new_user`.returnsRow({ id: "pg/uuid@1" }).build();

  await db.runtime().query(query);
}

async function removePendingRegistration(tokenHash: string, email: string): Promise<void> {
  const client = await redis();
  await client.del(`${PENDING_KEY_PREFIX}${tokenHash}`);
  const emailKey = `${PENDING_EMAIL_PREFIX}${email}`;
  const indexedHash = await client.get<string | null>(emailKey);
  if (indexedHash === tokenHash) await client.del(emailKey);
}

export async function createAccount(
  input: {
    email: string;
    username?: string | null;
    displayName?: string | null;
    password: string;
  },
  options: { requireVerification?: boolean } = {},
): Promise<StoredAccount> {
  const client = await redis();
  const email = input.email.trim().toLowerCase();
  const username = input.username?.trim() || null;

  if (await findAccountByEmail(email)) throw new Error("EMAIL_EXISTS");

  if (username) {
    const existingProfile = await db.orm.public.Profile.where({
      normalizedUsername: username.toLowerCase(),
    }).first();
    if (existingProfile) throw new Error("USERNAME_EXISTS");
  }

  const now = new Date();
  const requireVerification = options.requireVerification ?? false;
  const accountId = randomUUID();
  const passwordHash = await argon2.hash(input.password);

  if (!requireVerification) {
    const record: PendingRegistration = {
      id: accountId,
      email,
      username,
      displayName: input.displayName?.trim() || null,
      passwordHash,
      createdAt: now.toISOString(),
      expiresAt: now.toISOString(),
    };
    await createVerifiedAccount(record);
    const account = await findAccountById(accountId);
    if (!account) throw new Error("ACCOUNT_PERSISTENCE_FAILED");
    return account;
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now.getTime() + PENDING_TTL_SECONDS * 1000).toISOString();
  const pending: PendingRegistration = {
    id: accountId,
    email,
    username,
    displayName: input.displayName?.trim() || null,
    passwordHash,
    createdAt: now.toISOString(),
    expiresAt,
  };
  const emailKey = `${PENDING_EMAIL_PREFIX}${email}`;
  const claimed = await client.set(emailKey, tokenHash, { ex: PENDING_TTL_SECONDS, nx: true });
  if (claimed !== "OK") throw new Error("EMAIL_EXISTS");

  try {
    await client.set(`${PENDING_KEY_PREFIX}${tokenHash}`, pending, { ex: PENDING_TTL_SECONDS });
  } catch (error) {
    await client.del(emailKey);
    throw error;
  }
  return {
    ...pending,
    updatedAt: now.toISOString(),
    status: "PENDING_VERIFICATION",
    verifiedAt: null,
    verificationToken: token,
  };

}

export async function createVerificationTokenForAccount(
  account: StoredAccount,
): Promise<{ token: string; expiresAt: string }> {
  const client = await redis();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PENDING_TTL_SECONDS * 1000).toISOString();
  const pending: PendingRegistration = {
    id: account.id,
    email: account.email,
    username: account.username,
    displayName: account.displayName,
    passwordHash: account.passwordHash,
    createdAt: account.createdAt,
    expiresAt,
  };
  await client.set(`${PENDING_EMAIL_PREFIX}${account.email}`, tokenHash, { ex: PENDING_TTL_SECONDS });
  await client.set(`${PENDING_KEY_PREFIX}${tokenHash}`, pending, { ex: PENDING_TTL_SECONDS });
  return { token, expiresAt };
}

export async function verifyAccountToken(token: string): Promise<StoredAccount> {
  const client = await redis();
  const tokenHash = hashToken(token);
  const key = `${PENDING_KEY_PREFIX}${tokenHash}`;
  const record = await client.get<PendingRegistration | null>(key);
  if (!record) throw new Error("INVALID_TOKEN");

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await removePendingRegistration(tokenHash, record.email);
    throw new Error("TOKEN_EXPIRED");
  }

  // Do not consume the pending record until PostgreSQL confirms the permanent
  // account was written. A transient database failure leaves it retryable.
  const existing = await findAccountByEmail(record.email);
  if (!existing) {
    try {
      await createVerifiedAccount(record);
    } catch (error) {
      // A concurrent verification may have created the same account first.
      const createdByConcurrentRequest = await findAccountByEmail(record.email);
      if (!createdByConcurrentRequest) throw error;
    }
  }

  const account = await findAccountByEmail(record.email);
  if (!account) throw new Error("ACCOUNT_PERSISTENCE_FAILED");

  await removePendingRegistration(tokenHash, record.email);
  return account;
}

export async function verifyCredentials(email: string, password: string): Promise<StoredAccount | null> {
  const account = await findAccountByEmail(email);
  if (!account || account.status !== "ACTIVE" || !account.verifiedAt) return null;

  const passwordMatches = await argon2.verify(account.passwordHash, password).catch(() => false);
  return passwordMatches ? account : null;
}

export async function createSessionForUser(
  userId: string,
  metadata: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<StoredSession> {
  const account = await findAccountById(userId);
  if (!account || account.status !== "ACTIVE" || !account.verifiedAt) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  const now = new Date();
  const session: StoredSession = {
    id: randomBytes(32).toString("base64url"),
    userId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
  };
  const query = db.raw.sql`INSERT INTO public.sessions
    (id, user_id, session_hash, created_at, last_seen_at, expires_at, ip_address, user_agent)
    VALUES (
      ${randomUUID()}::uuid,
      ${userId}::uuid,
      ${hashToken(session.id)},
      ${session.createdAt}::timestamptz,
      ${session.createdAt}::timestamptz,
      ${session.expiresAt}::timestamptz,
      NULLIF(${metadata.ipAddress ?? ""}::text, ''),
      NULLIF(${metadata.userAgent ?? ""}::text, '')
    )
    RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build();
  await db.runtime().query(query);
  return session;
}

export async function getUserFromSession(sessionId: string): Promise<StoredAccount | null> {
  if (!sessionId) return null;
  const session = await db.orm.public.Session.where({ sessionHash: hashToken(sessionId) }).first();
  if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const account = await findAccountById(session.userId);
  return account?.status === "ACTIVE" && account.verifiedAt ? account : null;
}

export async function revokeSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  const now = new Date().toISOString();
  const query = db.raw.sql`UPDATE public.sessions
    SET revoked_at = ${now}::timestamptz
    WHERE session_hash = ${hashToken(sessionId)} AND revoked_at IS NULL
    RETURNING id`.returnsRow({ id: "pg/uuid@1" }).build();
  await db.runtime().query(query);
}
