"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { LanguagePicker } from "../components/LanguagePicker";

type IconName =
  | "email"
  | "lock"
  | "user"
  | "at"
  | "image"
  | "visibility"
  | "visibility-off"
  | "arrow"
  | "globe"
  | "theme";

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    email: (
      <>
        <path d="M20 6 12 13 4 6" />
        <rect x="3" y="5" width="18" height="14" rx="2" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0" />
      </>
    ),
    at: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="M16 12v2a2 2 0 0 0 4 0v-2" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    visibility: (
      <>
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    "visibility-off": (
      <>
        <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 3.1-.5" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </>
    ),
    theme: (
      <>
        <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

export default function Home() {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const { t } = useTranslation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setPasswordError(true);
      return;
    }

    setPasswordError(false);
    setSubmitError("");
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/signup", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        requiresVerification?: boolean;
        message?: string;
        email?: string;
      };

      if (!response.ok) throw new Error(payload.error ?? "Unable to create account.");
      if (payload.requiresVerification) {
        window.location.assign(`/verify-email?email=${encodeURIComponent(payload.email ?? "")}`);
        return;
      }
      window.location.assign("/");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={`auth-screen${isDark ? " auth-screen-dark" : ""}`}>
      <section aria-labelledby="signup-heading" className="auth-card signup-card">
        <header className="auth-header">
          <div aria-label="OneAuth" className="brand-mark">
            <svg aria-hidden="true" viewBox="0 0 32 32">
              <rect fill="currentColor" height="32" rx="8" width="32" />
              <path
                d="M16 7.5 23 11v5.2c0 4.1-2.8 7-7 8.3-4.2-1.3-7-4.2-7-8.3V11l7-3.5Z"
                fill="none"
                stroke="var(--brand-mark-stroke)"
                strokeWidth="1.8"
              />
              <path
                d="m12.8 16.2 2.1 2.1 4.5-4.8"
                fill="none"
                stroke="var(--brand-mark-stroke)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </div>
          <h1 id="signup-heading">{t("Create your OneAuth account")}</h1>
          <p className="intro-copy">
            {t("One identity. Every app. Create an account to get started.")}
          </p>
        </header>

        <form className="sign-up-form" onSubmit={handleSubmit}>
          <div className="field-group signup-email">
            <label htmlFor="email">{t("Email address")} <span className="required-mark">*</span></label>
            <div className="input-wrap">
              <Icon className="field-icon" name="email" />
              <input
                autoComplete="email"
                id="email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="display-name">
              {t("Display name")} <span className="optional-mark">{t("Optional")}</span>
            </label>
            <div className="input-wrap">
              <Icon className="field-icon" name="user" />
              <input
                autoComplete="name"
                id="display-name"
                name="displayName"
                placeholder={t("Your name")}
                type="text"
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="username">
              {t("Username")} <span className="optional-mark">{t("Optional")}</span>
            </label>
            <div className="input-wrap">
              <Icon className="field-icon" name="at" />
              <input
                autoComplete="username"
                id="username"
                name="username"
                placeholder={t("Choose a username")}
                type="text"
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="password">{t("Password")} <span className="required-mark">*</span></label>
            <div className="input-wrap">
              <Icon className="field-icon" name="lock" />
              <input
                autoComplete="new-password"
                id="password"
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setPasswordError(false);
                }}
                placeholder="••••••••••••"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={t(showPassword ? "Hide password" : "Show password")}
                aria-pressed={showPassword}
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                <Icon name={showPassword ? "visibility-off" : "visibility"} />
              </button>
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="confirm-password">
              {t("Confirm password")} <span className="required-mark">*</span>
            </label>
            <div className="input-wrap">
              <Icon className="field-icon" name="lock" />
              <input
                aria-describedby={passwordError ? "password-error" : undefined}
                aria-invalid={passwordError}
                autoComplete="new-password"
                id="confirm-password"
                name="confirmPassword"
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setPasswordError(false);
                }}
                placeholder="••••••••••••"
                required
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
              />
            </div>
          </div>

          <div className="field-group signup-picture">
            <label htmlFor="profile-picture">
              {t("Profile picture")} <span className="optional-mark">{t("Optional")}</span>
            </label>
            <div className="picture-upload">
              <Icon className="picture-icon" name="image" />
              <input
                accept="image/*"
                id="profile-picture"
                name="profilePicture"
                type="file"
              />
              <span>{t("You can add one later")}</span>
            </div>
          </div>

          {passwordError && (
            <p className="form-error" id="password-error" role="alert">
              {t("Passwords do not match.")}
            </p>
          )}

          {submitError && (
            <p className="form-error" role="alert">
              {submitError}
            </p>
          )}

          <div className="legal-consents">
            <label className="remember-option">
              <input name="acceptTerms" required type="checkbox" />
              <span>
                {t("I accept the")} <a href="/terms">{t("Terms of Service")}</a>
                <span className="required-mark"> *</span>
              </span>
            </label>
            <label className="remember-option">
              <input name="acceptPrivacy" required type="checkbox" />
              <span>
                {t("I agree to the")} <a href="/privacy">{t("Privacy Policy")}</a>
                <span className="required-mark"> *</span>
              </span>
            </label>
          </div>

          <button className="continue-button" disabled={isSubmitting} type="submit">
            <span>{isSubmitting ? t("Creating account...") : t("Create account")}</span>
            <Icon name="arrow" />
          </button>
        </form>

        <footer className="auth-footer">
          <p className="create-account">
            {t("Already have an account?")} <Link href="/">{t("Sign in")}</Link>
          </p>
          <div className="footer-meta">
            <div className="language-choice">
              <Icon name="globe" />
              <LanguagePicker className="language-button" />
            </div>
            <div className="version-controls">
              <button
                aria-label={t("Toggle color theme")}
                aria-pressed={isDark}
                className="theme-button"
                onClick={() => setIsDark((dark) => !dark)}
                type="button"
              >
                <Icon name="theme" />
              </button>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}
