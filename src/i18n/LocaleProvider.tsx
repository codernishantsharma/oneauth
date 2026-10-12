"use client";

import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { useState, type ReactNode } from "react";
import { resources, type Locale } from "./messages";

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const [i18n] = useState(() => {
    const instance = createInstance();
    void instance.init({
      resources,
      lng: initialLocale,
      fallbackLng: "en",
      supportedLngs: Object.keys(resources),
      interpolation: { escapeValue: false },
      initImmediate: false,
    });
    return instance;
  });

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
