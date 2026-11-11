import { NextResponse } from "next/server";

import { rotatePendingVerificationToken } from "@/src/lib/auth/account-store";
import { BrevoEmailError, sendVerificationEmail } from "@/src/lib/email/brevo";

function getPublicBaseUrl(request: Request): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("APP_URL_INVALID");
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("APP_URL_INVALID");
    return url;
  }

  if (process.env.NODE_ENV === "production") throw new Error("APP_URL_REQUIRED");
  return new URL(new URL(request.url).origin);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const publicBaseUrl = getPublicBaseUrl(request);
    const pending = await rotatePendingVerificationToken(email);
    // Avoid confirming whether an address has a pending registration.
    if (!pending) {
      return NextResponse.json({
        ok: true,
        message: "If a pending registration exists for this address, a verification email can be sent.",
      }, { status: 202 });
    }

    const verificationUrl = new URL("/api/verify", publicBaseUrl);
    verificationUrl.searchParams.set("token", pending.token);

    await sendVerificationEmail({
      email: pending.email,
      displayName: pending.displayName,
      verificationUrl: verificationUrl.toString(),
      expiresInHours: 3,
    });

    return NextResponse.json({
      ok: true,
      message: "If a pending registration exists for this address, a verification email can be sent.",
    }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "RESEND_RATE_LIMITED") {
      return NextResponse.json(
        { error: "Please wait 60 seconds before requesting another verification email." },
        { status: 429 },
      );
    }

    const detail = error instanceof BrevoEmailError
      ? `Brevo status ${error.statusCode ?? "unavailable"}`
      : error instanceof Error
        ? error.message
        : "unknown error";
    console.error("OneAuth resend verification failed:", detail);
    return NextResponse.json(
      { error: "We couldn't resend the verification email. Please try again shortly." },
      { status: 503 },
    );
  }
}
