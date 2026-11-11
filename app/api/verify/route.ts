import { NextResponse } from "next/server";

import { createSessionForUser, verifyAccountToken } from "@/src/lib/auth/account-store";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/src/lib/auth/session";

function sessionCookie(response: NextResponse, sessionId: string) {
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

function getClientMetadata(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return {
    ipAddress: ipAddress || null,
    userAgent: request.headers.get("user-agent"),
  };
}

function failureRedirect(request: Request, reason: string) {
  const destination = new URL("/verify-email", request.url);
  destination.searchParams.set("verification", reason);
  return NextResponse.redirect(destination, 303);
}

async function completeVerification(request: Request, token: string, redirectOnSuccess: boolean) {
  if (!token) {
    if (redirectOnSuccess) return failureRedirect(request, "missing");
    return NextResponse.json({ error: "Verification token is required." }, { status: 400 });
  }

  try {
    const account = await verifyAccountToken(token);
    const session = await createSessionForUser(account.id, getClientMetadata(request));

    if (redirectOnSuccess) {
      const response = NextResponse.redirect(new URL("/dashboard", request.url), 303);
      return sessionCookie(response, session.id);
    }

    const response = NextResponse.json({
      ok: true,
      verified: true,
      userId: account.id,
      email: account.email,
      username: account.username,
    });
    return sessionCookie(response, session.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to verify account.";
    if (redirectOnSuccess) {
      if (message === "TOKEN_EXPIRED") return failureRedirect(request, "expired");
      if (message === "INVALID_TOKEN") return failureRedirect(request, "invalid");
      console.error("OneAuth email verification failed:", message);
      return failureRedirect(request, "failed");
    }

    if (message === "INVALID_TOKEN") {
      return NextResponse.json({ error: "This verification link is invalid or already used." }, { status: 404 });
    }
    if (message === "TOKEN_EXPIRED") {
      return NextResponse.json({ error: "This verification link has expired. Please sign up again." }, { status: 410 });
    }
    if (message === "ACCOUNT_NOT_FOUND") {
      return NextResponse.json({ error: "This account could not be found." }, { status: 404 });
    }
    console.error("OneAuth email verification failed:", message);
    return NextResponse.json({ error: "Unable to verify this email address." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return completeVerification(request, url.searchParams.get("token") ?? "", true);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "").trim();
  return completeVerification(request, token, false);
}
