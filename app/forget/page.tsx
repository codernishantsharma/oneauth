"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { LanguagePicker } from "../components/LanguagePicker";

export default function ForgetPasswordPage() {
  const [isDark, setIsDark] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { t } = useTranslation();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <main className={`auth-screen${isDark ? " auth-screen-dark" : ""}`}>
      <section aria-labelledby="forget-heading" className="auth-card recovery-card">
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
          <h1 id="forget-heading">{t("Reset your password")}</h1>
          <p className="intro-copy">
            {t("Enter the email address for your account and we’ll send you a reset link.")}
          </p>
        </header>

        {submitted ? (
          <p className="recovery-message" role="status">
            {t("If an account exists for that email, a password reset link is on its way.")}
          </p>
        ) : (
          <form className="sign-in-form" onSubmit={handleSubmit}>
            <div className="field-group">
              <label htmlFor="email">{t("Email address")}</label>
              <div className="input-wrap">
                <svg
                  aria-hidden="true"
                  className="field-icon"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                  viewBox="0 0 24 24"
                >
                  <path d="M20 6 12 13 4 6" />
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                </svg>
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
            <button className="continue-button" type="submit">
              <span>{t("Send reset link")}</span>
            </button>
          </form>
        )}

        <footer className="auth-footer">
          <p className="create-account">
            <Link href="/">{t("Back to sign in")}</Link>
          </p>
          <div className="footer-meta">
            <div className="language-choice">
              <svg
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
              </svg>
              <LanguagePicker className="language-button" />
            </div>
            <button
              aria-label={t("Toggle color theme")}
              aria-pressed={isDark}
              className="theme-button"
              onClick={() => setIsDark((dark) => !dark)}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
