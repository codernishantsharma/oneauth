"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { LanguagePicker } from "./components/LanguagePicker";

type IconName = "email" | "lock" | "visibility" | "visibility-off" | "arrow" | "globe" | "theme" | "key";
function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    email: <><path d="M20 6 12 13 4 6" /><rect x="3" y="5" width="18" height="14" rx="2" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    visibility: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    "visibility-off": <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 3.1-.5" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
    theme: <><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="4" /></>,
    key: <><circle cx="8" cy="15" r="5" /><path d="m11.5 11.5 8-8 2 2-2 2 2 2-3 3-2-2-3.5 3.5" /></>,
  };
  return <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function BrandMark() {
  return <div aria-label="OneAuth" className="brand-mark"><svg aria-hidden="true" viewBox="0 0 32 32"><rect fill="currentColor" height="32" rx="8" width="32" /><path d="M16 7.5 23 11v5.2c0 4.1-2.8 7-7 8.3-4.2-1.3-7-4.2-7-8.3V11l7-3.5Z" fill="none" stroke="var(--brand-mark-stroke)" strokeWidth="1.8" /><path d="m12.8 16.2 2.1 2.1 4.5-4.8" fill="none" stroke="var(--brand-mark-stroke)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg></div>;
}

export default function Home() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const { t } = useTranslation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setIsSubmitting(true);
    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/login", { method: "POST", body: formData });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; requiresTwoFactor?: boolean; challenge?: string; ok?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Unable to sign in.");
      if (payload.requiresTwoFactor && payload.challenge) {
        setMfaChallenge(payload.challenge);
        return;
      }
      if (payload.ok) {
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasskeyLogin() {
    if (isPasskeyLoading || isSubmitting || mfaChallenge) return;
    setLoginError("");
    setIsPasskeyLoading(true);
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) {
        throw new Error("This browser or device doesn't support passkeys.");
      }
      const optionsResponse = await fetch("/api/login/passkey/options", { method: "POST" });
      const optionsPayload = await optionsResponse.json().catch(() => ({})) as { error?: string; options?: Parameters<typeof startAuthentication>[0]["optionsJSON"]; challengeToken?: string };
      if (!optionsResponse.ok || !optionsPayload.options || !optionsPayload.challengeToken) {
        throw new Error("Passkey sign-in is temporarily unavailable. Try your email and password instead.");
      }
      const credential = await startAuthentication({ optionsJSON: optionsPayload.options });
      const verifyResponse = await fetch("/api/login/passkey/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: optionsPayload.challengeToken, response: credential }),
      });
      const verifyPayload = await verifyResponse.json().catch(() => ({})) as { error?: string; ok?: boolean };
      if (!verifyResponse.ok || !verifyPayload.ok) {
        const messages: Record<string, string> = {
          PASSKEY_CHALLENGE_EXPIRED: "That passkey request expired. Please try again.",
          PASSKEY_NOT_RECOGNIZED: "No matching passkey was found. Try another device or sign in with your password.",
          PASSKEY_VERIFICATION_FAILED: "Passkey verification failed. Try again or use your password.",
          ACCOUNT_NOT_AVAILABLE: "This account is not available for sign-in.",
        };
        throw new Error(messages[verifyPayload.error ?? ""] ?? "Passkey sign-in failed. Try your email and password.");
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Passkey sign-in failed.";
      setLoginError(/cancel|abort|notallowed|not allowed/i.test(message) ? "Passkey sign-in was cancelled." : message);
    } finally {
      setIsPasskeyLoading(false);
    }
  }

  return (
    <main className={`auth-screen${isDark ? " auth-screen-dark" : ""}`}>
      <section aria-labelledby="login-heading" className="auth-card">
        <header className="auth-header">
          {mfaChallenge && (
            <button
              aria-label={t("Back to sign in")}
              className="mfa-back-arrow"
              onClick={() => { setMfaChallenge(null); setLoginError(""); }}
              type="button"
            >
              <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </button>
          )}
          <BrandMark />
          <h1 id="login-heading">{t(mfaChallenge ? "Verify it's you" : "Welcome back")}</h1>
          <p className="intro-copy">{t(mfaChallenge ? "Enter the current 6-digit code from your authenticator app, or use an unused recovery code." : "One identity. Every app. Sign in to access your interconnected workspace.")}</p>
        </header>

        <form className="sign-in-form" onSubmit={handleSubmit}>
          {mfaChallenge ? (
            <>
              <input name="mfaChallenge" type="hidden" value={mfaChallenge} />
              <div className="field-group">
                <label htmlFor="mfaCode">{t("Authenticator or recovery code")}</label>
                <div className="input-wrap">
                  <Icon className="field-icon" name="lock" />
                  <input autoComplete="one-time-code" autoFocus id="mfaCode" inputMode="text" name="mfaCode" placeholder="123456" autoCapitalize="characters" spellCheck={false} required />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="field-group">
                <label htmlFor="email">{t("Email address")}</label>
                <div className="input-wrap"><Icon className="field-icon" name="email" /><input autoComplete="username" id="email" name="email" placeholder="you@example.com" required type="email" /></div>
              </div>
              <div className="field-group">
                <label htmlFor="password">{t("Password")}</label>
                <div className="input-wrap">
                  <Icon className="field-icon" name="lock" />
                  <input autoComplete="current-password" id="password" name="password" placeholder="••••••••••••" required type={showPassword ? "text" : "password"} />
                  <button aria-label={t(showPassword ? "Hide password" : "Show password")} aria-pressed={showPassword} className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} type="button"><Icon name={showPassword ? "visibility-off" : "visibility"} /></button>
                </div>
              </div>
              <div className="form-options">
                <label className="remember-option"><input name="remember" type="checkbox" /><span>{t("Remember 30 days")}</span></label>
                <Link href="/forget">{t("Forgot password?")}</Link>
              </div>
            </>
          )}

          {loginError && <p className="form-error" role="alert">{loginError}</p>}

          <button className="continue-button" disabled={isSubmitting || isPasskeyLoading} type="submit">
            <span>{isSubmitting ? t("Signing in...") : t(mfaChallenge ? "Verify and sign in" : "Continue")}</span><Icon name="arrow" />
          </button>
          {!mfaChallenge && (
            <>
              <div className="login-method-divider"><span>{t("OR")}</span></div>
              <button className="login-passkey-button" disabled={isPasskeyLoading || isSubmitting} onClick={() => void handlePasskeyLogin()} type="button">
                <Icon name="key" />
                <span>{isPasskeyLoading ? t("Waiting for your passkey…") : t("Sign in with a passkey")}</span>
              </button>
            </>
          )}
        </form>

        <footer className="auth-footer">
          <p className="create-account">{t("Don't have an account?")} <Link href="/signup">{t("Create one")}</Link></p>
          <div className="footer-meta">
            <div className="language-choice"><Icon name="globe" /><LanguagePicker className="language-button" /></div>
            <button aria-label={t("Toggle color theme")} aria-pressed={isDark} className="theme-button" onClick={() => setIsDark((dark) => !dark)} type="button"><Icon name="theme" /></button>
          </div>
        </footer>
      </section>
    </main>
  );
}
