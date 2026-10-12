"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  isSupportedLocale,
  localeNames,
  supportedLocales,
  translate,
  type Locale,
} from "@/src/i18n/messages";

export function LanguagePicker({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentLocale = isSupportedLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";

  function changeLanguage(locale: Locale) {
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `oneauth-locale=${locale}; path=/; max-age=31536000; samesite=lax`;
    void i18n.changeLanguage(locale);
    // eslint-disable-next-line react-hooks/immutability
    document.documentElement.lang = locale;
    // eslint-disable-next-line react-hooks/immutability
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    // Keep the current page title intact when switching languages.
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      translate(locale, "OneAuth identity and access management platform."),
    );
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`portal-language-picker${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("Choose language")}
        className="portal-language-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </svg>
        <span>{localeNames[currentLocale]}</span>
        <svg aria-hidden="true" className={open ? "portal-language-chevron is-open" : "portal-language-chevron"} fill="none" height="14" viewBox="0 0 24 24" width="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
      {open ? (
        <div aria-label={t("Choose language")} className="portal-language-menu" role="listbox">
          {supportedLocales.map((locale) => (
            <button
              aria-selected={currentLocale === locale}
              className={currentLocale === locale ? "portal-language-option is-selected" : "portal-language-option"}
              key={locale}
              onClick={() => changeLanguage(locale)}
              role="option"
              type="button"
            >
              <span>{localeNames[locale]}</span>
              {currentLocale === locale ? <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
