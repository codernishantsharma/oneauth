import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { createSessionForUser, findAccountById, findAccountByEmail, verifyCredentials } from "@/src/lib/auth/account-store";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/src/lib/auth/session";
import { validateEmail } from "@/src/lib/identity/identity.validation";
import { writeSecurityEvent } from "@/src/lib/auth/security-events";
import { hasTotpEnabled, verifyTotpForLogin } from "@/src/lib/auth/security-settings";
import { deleteTemporaryValue, getTemporaryValue, setTemporaryValue } from "@/src/lib/redis/temporary";

const MFA_CHALLENGE_PREFIX = "oneauth:login-mfa:";
const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
const MAX_MFA_ATTEMPTS = 5;

function challengeKey(token: string) {
  return MFA_CHALLENGE_PREFIX + createHash("sha256").update(token).digest("hex");
}

async function completeLogin(request: Request, userId: string, method: "PASSWORD" | "TOTP" | "RECOVERY_CODE") {
  const user = await findAccountById(userId);
  if (!user || user.status !== "ACTIVE" || !user.verifiedAt) {
    return NextResponse.json({ error: "This account is not available for sign-in." }, { status: 403 });
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  const session = await createSessionForUser(user.id, {
    ipAddress: forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
  });
  await writeSecurityEvent({ userId: user.id, eventType: "LOGIN_SUCCESS", headers: request.headers, metadata: { method } });
  await writeSecurityEvent({ userId: user.id, eventType: "SESSION_CREATED", headers: request.headers, metadata: { expiresAt: session.expiresAt } });
  const response = NextResponse.json({ ok: true, userId: user.id, email: user.email, username: user.username });
  response.cookies.set(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const mfaChallenge = String(formData.get("mfaChallenge") ?? "").trim();

    if (mfaChallenge) {
      const code = String(formData.get("mfaCode") ?? "").trim();
      if (!/^[A-Za-z0-9 -]{6,32}$/.test(code)) {
        return NextResponse.json({ error: "Enter the 6-digit authenticator code or a recovery code." }, { status: 400 });
      }
      const key = challengeKey(mfaChallenge);
      const rawChallenge = await getTemporaryValue(key);
      if (!rawChallenge) return NextResponse.json({ error: "Your verification step expired. Sign in again." }, { status: 410 });
      let challenge: { userId: string; attempts: number };
      try {
        const parsed = JSON.parse(rawChallenge) as { userId?: unknown; attempts?: unknown };
        if (typeof parsed.userId !== "string") throw new Error("Invalid challenge");
        challenge = { userId: parsed.userId, attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0 };
      } catch {
        await deleteTemporaryValue(key);
        return NextResponse.json({ error: "Your verification step expired. Sign in again." }, { status: 410 });
      }
      if (challenge.attempts >= MAX_MFA_ATTEMPTS) {
        await deleteTemporaryValue(key);
        return NextResponse.json({ error: "Too many verification attempts. Sign in again." }, { status: 429 });
      }
      const verified = await verifyTotpForLogin(challenge.userId, code);
      if (!verified) {
        challenge.attempts += 1;
        if (challenge.attempts >= MAX_MFA_ATTEMPTS) {
          await deleteTemporaryValue(key);
          await writeSecurityEvent({ userId: challenge.userId, eventType: "LOGIN_FAILED", headers: request.headers, metadata: { reason: "MFA_ATTEMPTS_EXCEEDED" } });
          return NextResponse.json({ error: "Too many verification attempts. Sign in again." }, { status: 429 });
        }
        await setTemporaryValue(key, JSON.stringify(challenge), MFA_CHALLENGE_TTL_SECONDS);
        await writeSecurityEvent({ userId: challenge.userId, eventType: "LOGIN_FAILED", headers: request.headers, metadata: { reason: "INVALID_MFA_CODE" } });
        return NextResponse.json({ error: "That code wasn't accepted. Check it and try again." }, { status: 401 });
      }
      await deleteTemporaryValue(key);
      const normalizedCode = code.replace(/[ -]/g, "");
      const method = /^\d{6}$/.test(normalizedCode) ? "TOTP" : "RECOVERY_CODE";
      return completeLogin(request, challenge.userId, method);
    }

    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const normalizedEmail = validateEmail(email);
    const pendingAccount = await findAccountByEmail(normalizedEmail);
    if (pendingAccount && pendingAccount.status !== "ACTIVE") {
      await writeSecurityEvent({ userId: pendingAccount.id, eventType: "LOGIN_FAILED", headers: request.headers, metadata: { reason: "ACCOUNT_NOT_ACTIVE" } });
      return NextResponse.json({ error: "Please verify your email before signing in." }, { status: 403 });
    }

    const user = await verifyCredentials(normalizedEmail, password);
    if (!user) {
      await writeSecurityEvent({ userId: pendingAccount?.id ?? null, eventType: "LOGIN_FAILED", headers: request.headers, metadata: { reason: "INVALID_CREDENTIALS" } });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (await hasTotpEnabled(user.id)) {
      const challenge = randomBytes(32).toString("base64url");
      await setTemporaryValue(challengeKey(challenge), JSON.stringify({ userId: user.id, attempts: 0 }), MFA_CHALLENGE_TTL_SECONDS);
      return NextResponse.json({ requiresTwoFactor: true, challenge });
    }

    return completeLogin(request, user.id, "PASSWORD");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign in.";
    if (message === "INVALID_EMAIL") {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    console.error("OneAuth login failed:", message);
    return NextResponse.json({ error: "Unable to sign in. Please try again." }, { status: 500 });
  }
}
