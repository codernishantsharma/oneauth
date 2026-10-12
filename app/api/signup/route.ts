import { NextResponse } from "next/server";

import { discardPendingRegistration, createAccount } from "@/src/lib/auth/account-store";
import { BrevoEmailError, sendVerificationEmail } from "@/src/lib/email/brevo";
import { validateEmail, validateUsername } from "@/src/lib/identity/identity.validation";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const email = String(formData.get("email") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const acceptTerms = formData.get("acceptTerms") !== null;
    const acceptPrivacy = formData.get("acceptPrivacy") !== null;

    if (!email || !password || !acceptTerms || !acceptPrivacy) {
      return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long." }, { status: 400 });
    }

    const normalizedEmail = validateEmail(email);
    const normalizedUsername = username ? validateUsername(username) : undefined;

    const account = await createAccount(
      {
        email: normalizedEmail,
        username: normalizedUsername,
        displayName: displayName || undefined,
        password,
      },
      { requireVerification: true },
    );

    const token = account.verificationToken;
    if (!token) {
      throw new Error("VERIFICATION_TOKEN_UNAVAILABLE");
    }

    try {
      const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
      const baseUrl = configuredBaseUrl || (process.env.NODE_ENV === "production" ? "" : new URL(request.url).origin);
      if (!baseUrl) throw new Error("APP_URL_REQUIRED");

      const parsedBaseUrl = new URL(baseUrl);
      if (
        (process.env.NODE_ENV === "production" && parsedBaseUrl.protocol !== "https:") ||
        !["http:", "https:"].includes(parsedBaseUrl.protocol)
      ) {
        throw new Error("APP_URL_INVALID");
      }

      const verificationUrl = new URL("/api/verify", parsedBaseUrl);
      verificationUrl.searchParams.set("token", token);

      await sendVerificationEmail({
        email: account.email,
        displayName: account.displayName,
        verificationUrl: verificationUrl.toString(),
        expiresInHours: 3,
      });
    } catch (emailError) {
      try {
        await discardPendingRegistration(token, account.email);
      } catch {
        console.error("Failed to clean up a pending registration after email delivery failed.");
      }

      const reason = emailError instanceof BrevoEmailError
        ? `Brevo status ${emailError.statusCode ?? "unavailable"}`
        : emailError instanceof Error
          ? emailError.message
          : "unknown error";
      console.error("OneAuth verification email delivery failed:", reason);

      return NextResponse.json(
        { error: "We couldn't send your verification email. Please try signing up again shortly." },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        requiresVerification: true,
        userId: account.id,
        email: account.email,
        username: account.username,
        message: "Check your email to verify your account. The link expires in 3 hours.",
      },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account.";

    if (message === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }

    if (message === "USERNAME_EXISTS") {
      return NextResponse.json({ error: "Please choose a different username." }, { status: 422 });
    }

    return NextResponse.json({ error: "Unable to create account. Please check your details and try again." }, { status: 400 });
  }
}
