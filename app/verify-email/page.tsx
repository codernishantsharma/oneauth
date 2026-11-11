"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim() ?? "";
  const verificationResult = searchParams.get("verification");
  const [isSending, setIsSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) return;

    setNotice("");
    setError("");
    setIsSending(true);

    try {
      const response = await fetch("/api/signup/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to resend the email.");
      setNotice(payload.message ?? "If a pending registration exists for this address, a verification email can be sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to resend the email.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="auth-screen">
      <section aria-labelledby="verify-email-heading" className="auth-card recovery-card">
        <header className="auth-header">
          <div aria-label="OneAuth" className="brand-mark">
            <svg aria-hidden="true" viewBox="0 0 32 32">
              <rect fill="currentColor" height="32" rx="8" width="32" />
              <path d="M16 7.5 23 11v5.2c0 4.1-2.8 7-7 8.3-4.2-1.3-7-4.2-7-8.3V11l7-3.5Z" fill="none" stroke="var(--brand-mark-stroke)" strokeWidth="1.8" />
              <path d="m12.8 16.2 2.1 2.1 4.5-4.8" fill="none" stroke="var(--brand-mark-stroke)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          </div>
          <h1 id="verify-email-heading">{verificationResult ? "Email verification" : "Check your email"}</h1>
          <p className="intro-copy">
            {verificationResult === "expired"
              ? "This verification link has expired. Pending registrations are kept for 3 hours, so please sign up again."
              : verificationResult === "invalid" || verificationResult === "missing"
                ? "This verification link is invalid or has already been used. Sign in if you have already verified your account, or sign up again."
                : verificationResult === "failed"
                  ? "We couldn't complete verification right now. Please try the link again or sign in if your account is already active."
                  : "Open the verification link from your inbox to activate your OneAuth account."}
          </p>
        </header>

        <div className="verification-mail-icon" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="10" width="38" height="28" rx="5" />
            <path d="m7 13 17 14 17-14" />
          </svg>
        </div>

        <div className="recovery-message">
          {email ? <p className="verification-recipient">Verification email for <strong>{email}</strong></p> : null}
          {!verificationResult && <strong>Verification link expires in 3 hours.</strong>}
          {!verificationResult && <p>Check your inbox and spam folder. If it hasn&apos;t arrived, request another link below.</p>}
        </div>

        {!verificationResult && (
          <form className="verification-resend-form" onSubmit={handleResend}>
            {notice && <p className="form-success" role="status">{notice}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="continue-button" disabled={isSending || !email} type="submit">
              <span>{isSending ? "Sending..." : "Resend verification email"}</span>
            </button>
          </form>
        )}

        <footer className="auth-footer">
          <p className="create-account"><Link href="/signup">Back to sign up</Link> · <Link href="/">Sign in</Link></p>
        </footer>
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="auth-screen"><section className="auth-card recovery-card"><p>Loading verification details…</p></section></main>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
